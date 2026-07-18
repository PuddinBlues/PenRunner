import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@penrunner/db";
import { extractToken } from "../src/services/mailer.js";
import {
  registerUserWithProfile,
  setupApi,
  type TestApi,
} from "./helpers.js";

let api: TestApi;
let orgId: string;
let eventId: string;
let organizerToken: string;

beforeAll(async () => {
  api = await setupApi();

  // Organizzatore con organizzazione verificata da un admin.
  const organizer = await registerUserWithProfile(
    api,
    "club@example.com",
    "Referente Club",
  );
  organizerToken = organizer.sessionToken;
  const organizerCaller = await api.as(organizerToken);
  ({ organizationId: orgId } = await organizerCaller.org.create({
    name: "Reining Club Lombardia",
  }));

  // Gate del vetting: senza verifica, creare eventi è vietato.
  await expect(
    organizerCaller.events.create({
      organizationId: orgId,
      name: "Evento anticipato",
      venue: "Arena",
      startDate: "2026-09-01",
      endDate: "2026-09-02",
    }),
  ).rejects.toThrow(/organizzazione verificata/);

  const admin = await registerUserWithProfile(
    api,
    "staff@penrunner.example",
    "Staff PenRunner",
  );
  await api.db
    .update(schema.users)
    .set({ platformAdmin: true })
    .where(eq(schema.users.id, admin.userId));
  const adminCaller = await api.as(admin.sessionToken);
  await adminCaller.admin.approveOrganization({ organizationId: orgId });

  // L'actor si risolve alla creazione del caller: dopo il vetting serve
  // un contesto fresco (in HTTP succede a ogni richiesta).
  const vettedOrganizer = await api.as(organizerToken);
  ({ eventId } = await vettedOrganizer.events.create({
    organizationId: orgId,
    name: "Summer Slide 2026",
    venue: "Arena Lombardia",
    startDate: "2026-09-01",
    endDate: "2026-09-02",
  }));
});

afterAll(async () => {
  await api.close();
});

describe("inviti event-scoped (giudice/scribe senza account pieno)", () => {
  it("invito giudice: accettazione → sessione scoped, senza user", async () => {
    const organizer = await api.as(organizerToken);
    await organizer.invite.create({
      eventId,
      role: "giudice",
      person: { fullName: "Judge Smith", email: "judge@example.com" },
    });
    const inviteToken = extractToken(api.mailer.lastTo("judge@example.com")!);

    const anon = await api.as();
    const accepted = await anon.invite.accept({ token: inviteToken });
    expect(accepted.eventId).toBe(eventId);
    expect(accepted.role).toBe("giudice");

    // Nessun account creato: solo person + sessione scoped.
    const users = await api.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, "judge@example.com"));
    expect(users).toHaveLength(0);

    // La sessione scoped non ha capacità da utente pieno.
    const judgeCaller = await api.as(accepted.sessionToken);
    await expect(judgeCaller.profile.claimStatus()).rejects.toThrow(
      /UNAUTHORIZED/,
    );
  });

  it("il magic link è monouso", async () => {
    const organizer = await api.as(organizerToken);
    await organizer.invite.create({
      eventId,
      role: "scribe",
      person: { fullName: "Scribe Uno", email: "scribe@example.com" },
    });
    const token = extractToken(api.mailer.lastTo("scribe@example.com")!);
    const anon = await api.as();
    await anon.invite.accept({ token });
    await expect(anon.invite.accept({ token })).rejects.toThrow(
      /non valido, scaduto o revocato/,
    );
  });

  it("modello identità: invito a email già nota → stessa person, non un doppione", async () => {
    const [existing] = await api.db
      .insert(schema.persons)
      .values({ fullName: "Giudice Noto", email: "noto@example.com" })
      .returning();
    const organizer = await api.as(organizerToken);
    const { assignmentId } = await organizer.invite.create({
      eventId,
      role: "giudice",
      person: { fullName: "Giudice Noto Bis", email: "noto@example.com" },
    });
    const [assignment] = await api.db
      .select()
      .from(schema.eventRoleAssignments)
      .where(eq(schema.eventRoleAssignments.id, assignmentId));
    expect(assignment!.personId).toBe(existing!.id);
  });

  it("invito revocato → l'accettazione fallisce", async () => {
    const organizer = await api.as(organizerToken);
    const { inviteId } = await organizer.invite.create({
      eventId,
      role: "segreteria",
      person: { fullName: "Aiuto Segreteria", email: "aiuto@example.com" },
    });
    const token = extractToken(api.mailer.lastTo("aiuto@example.com")!);
    await organizer.invite.revoke({ inviteId });
    const anon = await api.as();
    await expect(anon.invite.accept({ token })).rejects.toThrow(
      /non valido, scaduto o revocato/,
    );
  });

  it("invito scaduto → l'accettazione fallisce", async () => {
    const organizer = await api.as(organizerToken);
    const { inviteId } = await organizer.invite.create({
      eventId,
      role: "scribe",
      person: { fullName: "Scribe Tardi", email: "tardi@example.com" },
    });
    const token = extractToken(api.mailer.lastTo("tardi@example.com")!);
    await api.db
      .update(schema.eventInvites)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.eventInvites.id, inviteId));
    const anon = await api.as();
    await expect(anon.invite.accept({ token })).rejects.toThrow(
      /non valido, scaduto o revocato/,
    );
  });

  it("sostituzione giudice: la disattivazione chiude la sessione ma preserva le carte firmate", async () => {
    const organizer = await api.as(organizerToken);
    const { assignmentId } = await organizer.invite.create({
      eventId,
      role: "giudice",
      person: { fullName: "Giudice Uscente", email: "uscente@example.com" },
    });
    const token = extractToken(api.mailer.lastTo("uscente@example.com")!);
    const anon = await api.as();
    const { sessionToken } = await anon.invite.accept({ token });

    // Il giudice ha già firmato una carta (fixture minima).
    const [assignment] = await api.db
      .select()
      .from(schema.eventRoleAssignments)
      .where(eq(schema.eventRoleAssignments.id, assignmentId));
    const judgePersonId = assignment!.personId;

    const [category] = await api.db.select().from(schema.categories).limit(1);
    const [pattern] = await api.db.select().from(schema.patterns).limit(1);
    const [cls] = await api.db
      .insert(schema.classes)
      .values({
        eventId,
        categoryId: category!.id,
        name: "Classe test",
        patternId: pattern!.id,
      })
      .returning();
    const [owner] = await api.db
      .insert(schema.persons)
      .values({ fullName: "Owner X" })
      .returning();
    const [horse] = await api.db
      .insert(schema.horses)
      .values({ name: "Gun Smoke", microchip: "380-TEST-1", ownerId: owner!.id })
      .returning();
    const [entry] = await api.db
      .insert(schema.entries)
      .values({ classId: cls!.id, horseId: horse!.id, riderId: owner!.id })
      .returning();
    const [run] = await api.db
      .insert(schema.runs)
      .values({ entryId: entry!.id })
      .returning();
    const [card] = await api.db
      .insert(schema.scoreCards)
      .values({
        runId: run!.id,
        judgeId: judgePersonId,
        status: "firmata",
        closedAt: new Date(),
        signedAt: new Date(),
      })
      .returning();

    // Sostituzione: si disattiva l'assegnazione, non si cancella nulla.
    await organizer.invite.deactivateAssignment({ assignmentId });

    // La sessione scoped non risolve più un attore valido.
    const stale = await api.as(sessionToken);
    await expect(
      stale.invite.revoke({ inviteId: assignmentId }),
    ).rejects.toThrow(/UNAUTHORIZED/);

    // La carta firmata è ancora lì, intestata al giudice uscente.
    const [survivor] = await api.db
      .select()
      .from(schema.scoreCards)
      .where(eq(schema.scoreCards.id, card!.id));
    expect(survivor!.judgeId).toBe(judgePersonId);
    expect(survivor!.status).toBe("firmata");
  });

  it("solo l'organizzatore dell'evento crea inviti", async () => {
    const outsider = await registerUserWithProfile(
      api,
      "estraneo@example.com",
      "Utente Estraneo",
    );
    const caller = await api.as(outsider.sessionToken);
    await expect(
      caller.invite.create({
        eventId,
        role: "giudice",
        person: { fullName: "Chiunque", email: "x@example.com" },
      }),
    ).rejects.toThrow(/FORBIDDEN/);
  });
});
