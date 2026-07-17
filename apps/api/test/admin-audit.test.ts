import { desc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@penrunner/db";
import {
  expectDbError,
  registerUserWithProfile,
  setupApi,
  type TestApi,
} from "./helpers.js";

let api: TestApi;
let adminToken: string;
let adminUserId: string;

beforeAll(async () => {
  api = await setupApi();
  const admin = await registerUserWithProfile(
    api,
    "staff@penrunner.example",
    "Staff PenRunner",
  );
  adminUserId = admin.userId;
  adminToken = admin.sessionToken;
  await api.db
    .update(schema.users)
    .set({ platformAdmin: true })
    .where(eq(schema.users.id, admin.userId));
});

afterAll(async () => {
  await api.close();
});

async function lastAudit() {
  const [row] = await api.db
    .select()
    .from(schema.auditLog)
    .orderBy(desc(schema.auditLog.occurredAt))
    .limit(1);
  return row;
}

describe("vetting organizzatori (BR-70)", () => {
  it("approvazione: stato + audit con attore e prima/dopo", async () => {
    const member = await registerUserWithProfile(
      api,
      "club1@example.com",
      "Referente Uno",
    );
    const caller = await api.as(member.sessionToken);
    const { organizationId } = await caller.org.create({ name: "Club Uno" });

    const adminCaller = await api.as(adminToken);
    await adminCaller.admin.approveOrganization({ organizationId });

    const [org] = await api.db
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.id, organizationId));
    expect(org!.vettingStatus).toBe("verificata");
    expect(org!.verifiedBy).toBe(adminUserId);

    const audit = await lastAudit();
    expect(audit).toMatchObject({
      actorUserId: adminUserId,
      action: "organization.vetting.approve",
      entityType: "organization",
      entityId: organizationId,
      before: { vettingStatus: "in_verifica" },
      after: { vettingStatus: "verificata" },
    });
  });

  it("rifiuto: sempre motivato, in stato e in audit", async () => {
    const member = await registerUserWithProfile(
      api,
      "club2@example.com",
      "Referente Due",
    );
    const caller = await api.as(member.sessionToken);
    const { organizationId } = await caller.org.create({ name: "Club Due" });

    const adminCaller = await api.as(adminToken);
    // niente rifiuto senza motivazione
    await expect(
      adminCaller.admin.rejectOrganization({ organizationId, note: "" }),
    ).rejects.toThrow();

    await adminCaller.admin.rejectOrganization({
      organizationId,
      note: "Club non affiliato IRHA/FISE",
    });
    const [org] = await api.db
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.id, organizationId));
    expect(org!.vettingStatus).toBe("respinta");
    expect(org!.vettingNote).toBe("Club non affiliato IRHA/FISE");

    const audit = await lastAudit();
    expect(audit!.action).toBe("organization.vetting.reject");
    expect(audit!.note).toBe("Club non affiliato IRHA/FISE");
  });

  it("la coda di vetting è riservata all'admin", async () => {
    const member = await registerUserWithProfile(
      api,
      "curioso@example.com",
      "Utente Curioso",
    );
    const caller = await api.as(member.sessionToken);
    await expect(caller.admin.vettingQueue()).rejects.toThrow(/FORBIDDEN/);
  });
});

describe("sospensione account", () => {
  it("sospende: sessioni revocate, login bloccato, audit scritto; poi riattiva", async () => {
    const target = await registerUserWithProfile(
      api,
      "sospeso@example.com",
      "Utente Sospeso",
    );
    const adminCaller = await api.as(adminToken);
    await adminCaller.admin.suspendUser({
      userId: target.userId,
      reason: "Comportamento fraudolento segnalato",
    });

    // la sessione attiva è stata tagliata
    const stale = await api.as(target.sessionToken);
    await expect(stale.profile.claimStatus()).rejects.toThrow(/UNAUTHORIZED/);

    // il login è bloccato
    const anon = await api.as();
    await expect(
      anon.auth.login({
        email: "sospeso@example.com",
        password: "password-di-test",
      }),
    ).rejects.toThrow(/sospeso/);

    const audit = await lastAudit();
    expect(audit!.action).toBe("user.suspend");
    expect(audit!.note).toBe("Comportamento fraudolento segnalato");

    await adminCaller.admin.unsuspendUser({ userId: target.userId });
    const { sessionToken } = await anon.auth.login({
      email: "sospeso@example.com",
      password: "password-di-test",
    });
    expect(sessionToken).toBeTruthy();
    expect((await lastAudit())!.action).toBe("user.unsuspend");
  });
});

describe("audit log immutabile (BR-71)", () => {
  it("UPDATE e DELETE sono rifiutati dal database, per chiunque", async () => {
    const audit = await lastAudit();
    expect(audit).toBeDefined();
    await expectDbError(
      api.db
        .update(schema.auditLog)
        .set({ note: "riscritto" })
        .where(eq(schema.auditLog.id, audit!.id)),
      /audit_log_immutable/,
    );
    await expectDbError(
      api.db.delete(schema.auditLog).where(eq(schema.auditLog.id, audit!.id)),
      /audit_log_immutable/,
    );
  });
});
