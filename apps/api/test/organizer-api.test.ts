import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@penrunner/db";
import {
  registerUserWithProfile,
  setupApi,
  type TestApi,
} from "./helpers.js";

// ---------------------------------------------------------------------------
// Superficie API del back-office organizzatore: preparazione in bozza SENZA
// vetting (BR-80: si impara facendo; è la pubblicazione a essere gated),
// catalogo, CRUD classi con i suoi guard, quota PenRunner read-only con
// margine derivato, audit event-scoped.
// ---------------------------------------------------------------------------

let api: TestApi;
let orgId: string;
let eventId: string;
let organizerToken: string;
let adminToken: string;
let categoryId: string;
let categoryName: string;
let walkInPatternId: string; // pattern walk-in trot-in mandatable
let lopeInPatternId: string; // pattern lope-in: trot-in NON imponibile

beforeAll(async () => {
  api = await setupApi();

  const organizer = await registerUserWithProfile(
    api,
    "organizer@example.com",
    "Referente Club",
  );
  organizerToken = organizer.sessionToken;
  const caller = await api.as(organizerToken);
  ({ organizationId: orgId } = await caller.org.create({
    name: "Reining Club Piemonte",
  }));

  const admin = await registerUserWithProfile(
    api,
    "staff@penrunner.example",
    "Staff PenRunner",
  );
  await api.db
    .update(schema.users)
    .set({ platformAdmin: true })
    .where(eq(schema.users.id, admin.userId));
  adminToken = admin.sessionToken;

  // Dal catalogo pubblico: una categoria e due pattern con regole d'ingresso
  // diverse (per il guard BR-26 sul trot-in imposto).
  const anon = await api.as();
  const categories = await anon.catalog.categories();
  categoryId = categories[0]!.id;
  categoryName = categories[0]!.name;
  const patterns = await anon.catalog.patterns();
  walkInPatternId = patterns.find((p) => p.trotInMandatable)!.id;
  lopeInPatternId = patterns.find(
    (p) => p.entryGait === "lope_in" && !p.trotInMandatable,
  )!.id;
});

afterAll(async () => {
  await api.close();
});

describe("preparazione in bozza senza vetting (BR-80)", () => {
  it("l'organizzazione in verifica crea evento e classi", async () => {
    const caller = await api.as(organizerToken);
    ({ eventId } = await caller.events.create({
      organizationId: orgId,
      name: "Winter Classic 2026",
      venue: "Arena Piemonte",
      startDate: "2026-11-07",
      endDate: "2026-11-08",
    }));
    const { classId } = await caller.classes.create({
      eventId,
      categoryId,
      patternId: walkInPatternId,
      entryFee: "120",
    });
    // Nome di default dal catalogo: stato vuoto che si spiega da solo.
    const list = await caller.classes.listByEvent({ eventId });
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe(classId);
    expect(list[0]!.name).toBe(categoryName);
    expect(list[0]!.entriesCount).toBe(0);
  });

  it("annunciare senza vetting è vietato, con il passo successivo nel messaggio", async () => {
    const caller = await api.as(organizerToken);
    await expect(
      caller.events.setStatus({ eventId, status: "annunciato" }),
    ).rejects.toThrow(/in verifica/);
  });

  it("dopo l'approvazione la pubblicazione passa", async () => {
    const adminCaller = await api.as(adminToken);
    await adminCaller.admin.approveOrganization({ organizationId: orgId });
    const caller = await api.as(organizerToken); // actor fresco post-vetting
    const { status } = await caller.events.setStatus({
      eventId,
      status: "annunciato",
    });
    expect(status).toBe("annunciato");
  });
});

describe("catalogo per il wizard", () => {
  it("categorie e pattern della stagione, pubblici", async () => {
    const anon = await api.as();
    const categories = await anon.catalog.categories();
    expect(categories).toHaveLength(24);
    const patterns = await anon.catalog.patterns();
    expect(patterns).toHaveLength(20);
    // Ordinati "1"…"18" numerici poi lettere; ogni pattern porta i conteggi.
    expect(patterns[0]!.code).toBe("1");
    expect(patterns.at(-1)!.code).toBe("B");
    expect(patterns[0]!.maneuversCount).toBeGreaterThan(0);
  });
});

describe("validazioni leggere ART. 15 (avvisi, mai blocchi)", () => {
  it("trofeo > 75 € e quota regionale > 30 € → warning, la classe si crea comunque", async () => {
    const caller = await api.as(organizerToken);
    // l'evento del test è tier regionale (default)
    const res = await caller.classes.create({
      eventId,
      categoryId,
      patternId: walkInPatternId,
      name: "Classe fuori tetti",
      entryFee: "40",
      trophyCost: "90",
    });
    expect(res.classId).toBeTruthy(); // MAI bloccante
    expect(res.warnings).toHaveLength(2);
    expect(res.warnings.map((w) => w.code)).toEqual(["ART-15", "ART-15"]);
    expect(res.warnings.some((w) => /75 €/.test(w.message))).toBe(true);
    expect(res.warnings.some((w) => /30 €/.test(w.message))).toBe(true);
    await caller.classes.remove({ classId: res.classId });
  });

  it("entro i tetti: nessun avviso", async () => {
    const caller = await api.as(organizerToken);
    const res = await caller.classes.create({
      eventId,
      categoryId,
      patternId: walkInPatternId,
      name: "Classe nei tetti",
      entryFee: "30",
      trophyCost: "75",
    });
    expect(res.warnings).toEqual([]);
    await caller.classes.remove({ classId: res.classId });
  });
});

describe("CRUD classi: guard di integrità", () => {
  it("il trot-in imposto vale solo dove il pattern lo ammette (BR-26)", async () => {
    const caller = await api.as(organizerToken);
    await expect(
      caller.classes.create({
        eventId,
        categoryId,
        patternId: lopeInPatternId,
        trotInImposed: true,
      }),
    ).rejects.toThrow(/non ammette il trot-in/);
  });

  it("i campi economici restano modificabili, il draw congela la struttura", async () => {
    const caller = await api.as(organizerToken);
    const { classId } = await caller.classes.create({
      eventId,
      categoryId,
      patternId: walkInPatternId,
      name: "Classe draw test",
    });
    await caller.classes.update({ classId, addedMoney: "500" });

    // Simula il draw pubblicato: pattern e giudici congelati, soldi no.
    await api.db
      .update(schema.classes)
      .set({ drawStatus: "pubblicato" })
      .where(eq(schema.classes.id, classId));
    await expect(
      caller.classes.update({ classId, patternId: lopeInPatternId }),
    ).rejects.toThrow(/Draw pubblicato/);
    const { updated } = await caller.classes.update({
      classId,
      trophyCost: "80",
    });
    expect(updated).toBe(true);

    // Rimozione post-draw: il lavoro rimandato è dichiarato, non un buco.
    await expect(caller.classes.remove({ classId })).rejects.toThrow(
      /versione futura/,
    );
  });

  it("la rimozione è solo per classi vuote; con iscrizioni si dichiara il limite", async () => {
    const caller = await api.as(organizerToken);
    const { classId } = await caller.classes.create({
      eventId,
      categoryId,
      patternId: walkInPatternId,
      name: "Classe con iscritti",
    });
    const [owner] = await api.db
      .insert(schema.persons)
      .values({ firstName: "Rider", lastName: "Uno" })
      .returning();
    const [horse] = await api.db
      .insert(schema.horses)
      .values({
        name: "Smart Chic",
        microchip: "380271000000001",
        ownerId: owner!.id,
      })
      .returning();
    await api.db.insert(schema.entries).values({
      classId,
      horseId: horse!.id,
      riderId: owner!.id,
      status: "confermata",
    });
    await expect(caller.classes.remove({ classId })).rejects.toThrow(
      /iscrizioni/,
    );

    const { classId: emptyClassId } = await caller.classes.create({
      eventId,
      categoryId,
      patternId: walkInPatternId,
      name: "Classe vuota",
    });
    const { removed } = await caller.classes.remove({ classId: emptyClassId });
    expect(removed).toBe(true);
  });
});

describe("vista organizzatore: eventi e quota (BR-02 read-only)", () => {
  it("events.mine elenca con conteggio classi", async () => {
    const caller = await api.as(organizerToken);
    const mine = await caller.events.mine();
    expect(mine).toHaveLength(1);
    expect(mine[0]!.id).toBe(eventId);
    expect(mine[0]!.classesCount).toBeGreaterThan(0);
  });

  it("events.get mostra quota effettiva e margine, mai scrivibili da qui", async () => {
    // L'admin concede lo sconto 10 (leva commerciale, auditata BR-71).
    const adminCaller = await api.as(adminToken);
    await adminCaller.admin.setEventPlatformFee({
      eventId,
      platformFeePerHorse: 10,
      note: "accordo pilota",
    });
    const caller = await api.as(organizerToken);
    const detail = await caller.events.get({ eventId });
    expect(detail.effectivePlatformFeePerHorse).toBe(10);
    expect(detail.organizerMarginPerHorse).toBe(5); // fee 15 − quota 10
    expect(detail.organizationVetted).toBe(true);
  });

  it("la quota al cavaliere si fissa prima dell'apertura iscrizioni (BR-03)", async () => {
    const caller = await api.as(organizerToken);
    await caller.events.update({ eventId, name: "Winter Classic" });
    await caller.events.setStatus({ eventId, status: "iscrizioni_aperte" });
    await expect(
      caller.events.update({ eventId, feePerHorse: "20" }),
    ).rejects.toThrow(/prima dell'apertura/);
    // gli altri campi restano modificabili
    const { updated } = await caller.events.update({
      eventId,
      sponsorName: "Sella d'Oro",
    });
    expect(updated).toBe(true);
  });
});

describe("inviti dal browser", () => {
  it("il token torna a chi invita e la lista mostra lo stato", async () => {
    const caller = await api.as(organizerToken);
    const { token, assignmentId } = await caller.invite.create({
      eventId,
      role: "giudice",
      person: { firstName: "Judge", lastName: "Uno", email: "judge@example.com" },
    });
    expect(token).toBeTruthy();
    const list = await caller.invite.list({ eventId });
    const row = list.find((r) => r.assignmentId === assignmentId);
    expect(row?.fullName).toBe("Judge Uno");
    expect(row?.acceptedAt).toBeNull();
  });
});

describe("viste operative di classe", () => {
  it("registryByEvent espone i binomi già allo show (per la late entry)", async () => {
    const caller = await api.as(organizerToken);
    const registry = await caller.entries.registryByEvent({ eventId });
    expect(registry.horses.map((h) => h.name)).toContain("Smart Chic");
    expect(registry.riders.map((r) => r.fullName)).toContain("Rider Uno");
  });

  it("runsByClass è vuota prima della pubblicazione del draw", async () => {
    const caller = await api.as(organizerToken);
    const list = await caller.classes.listByEvent({ eventId });
    const runs = await caller.scoring.runsByClass({
      classId: list[0]!.id,
    });
    expect(runs).toEqual([]);
  });
});

describe("audit event-scoped (trasparenza, non potere)", () => {
  it("l'organizzatore vede le righe del SUO evento; la nota della quota è tra staff", async () => {
    const caller = await api.as(organizerToken);
    const rows = await caller.audit.forEvent({ eventId });
    const feeRow = rows.find((r) => r.action === "event.platform_fee.set");
    expect(feeRow).toBeDefined();
    expect(feeRow!.note).toBeNull(); // "accordo pilota" non trapela
  });

  it("l'evento di un'altra organizzazione è fuori perimetro", async () => {
    const other = await registerUserWithProfile(
      api,
      "altro-club@example.com",
      "Altro Referente",
    );
    const otherCaller = await api.as(other.sessionToken);
    const { organizationId: otherOrgId } = await otherCaller.org.create({
      name: "Altro Club",
    });
    const fresh = await api.as(other.sessionToken);
    const { eventId: otherEventId } = await fresh.events.create({
      organizationId: otherOrgId,
      name: "Evento altrui",
      venue: "Arena X",
      startDate: "2026-12-01",
      endDate: "2026-12-01",
    });
    const caller = await api.as(organizerToken);
    await expect(caller.audit.forEvent({ eventId: otherEventId })).rejects.toThrow(
      /FORBIDDEN/,
    );
  });
});
