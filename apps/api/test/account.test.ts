import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@penrunner/db";
import {
  TEST_DATABASE_URL,
  futureDate,
  registerUserWithProfile,
  setupApi,
  type TestApi,
} from "./helpers.js";

// ---------------------------------------------------------------------------
// BR-89: il conto scuderia. Vista DERIVATA (zero totali memorizzati), stessa
// funzione di pricing del checkout, storico dalle transizioni auditate,
// guardia FORBIDDEN cross-scuderia, CSV col naming unico dei documenti.
// ---------------------------------------------------------------------------

let api: TestApi;
let organizerToken: string;
let stableToken: string;
let strangerToken: string;
let stableId: string;
let eventId: string;
let classAId: string;
let classBId: string;
let riderId: string;
let horse1: string;
let horse2: string;
let confirmQuote: {
  horses: number;
  enrollments: number;
  classesCost: number;
  fee: number;
  total: number;
};
let scratchedEntryId: string;

beforeAll(async () => {
  api = await setupApi();

  const organizer = await registerUserWithProfile(
    api,
    "org@account-test.example",
    "Organizzatore Conti",
  );
  organizerToken = organizer.sessionToken;
  let orgCaller = await api.as(organizerToken);
  const { organizationId } = await orgCaller.org.create({ name: "Club Conti" });
  const admin = await registerUserWithProfile(
    api,
    "admin@account-test.example",
    "Admin",
  );
  await api.db
    .update(schema.users)
    .set({ platformAdmin: true })
    .where(eq(schema.users.id, admin.userId));
  const adminCaller = await api.as(admin.sessionToken);
  await adminCaller.admin.approveOrganization({ organizationId });
  orgCaller = await api.as(organizerToken);
  ({ eventId } = await orgCaller.events.create({
    organizationId,
    name: "Evento Conti 2026",
    venue: "Arena",
    startDate: futureDate(45),
    endDate: futureDate(46),
    feePerHorse: "15",
  }));
  const anon = await api.as();
  const categories = await anon.catalog.categories();
  const patterns = await anon.catalog.patterns();
  ({ classId: classAId } = await orgCaller.classes.create({
    eventId,
    categoryId: categories[0]!.id,
    patternId: patterns[0]!.id,
    name: "Open conto",
    entryFee: "100",
  }));
  ({ classId: classBId } = await orgCaller.classes.create({
    eventId,
    categoryId: categories[1]!.id,
    patternId: patterns[0]!.id,
    name: "Non Pro conto",
    entryFee: "80",
  }));
  await orgCaller.events.setStatus({ eventId, status: "annunciato" });
  await orgCaller.events.setStatus({ eventId, status: "iscrizioni_aperte" });

  const stableUser = await registerUserWithProfile(
    api,
    "scuderia@account-test.example",
    "Referente Conti",
  );
  stableToken = stableUser.sessionToken;
  let caller = await api.as(stableToken);
  ({ stableId } = await caller.roster.createStable({ name: "Conto Team" }));
  caller = await api.as(stableToken);
  const rider = await caller.roster.addRider({
    stableId,
    firstName: "Rita",
    lastName: "Conti",
    email: "rita@account-test.example",
  });
  riderId = rider.personId;
  const h1 = await caller.roster.addHorse({
    stableId,
    name: "Cash Ledger",
    microchip: "380271000010001",
    ownerPersonId: riderId,
  });
  horse1 = h1.horseId;
  const h2 = await caller.roster.addHorse({
    stableId,
    name: "Book Keeper",
    microchip: "380271000010002",
    ownerPersonId: riderId,
  });
  horse2 = h2.horseId;

  const stranger = await registerUserWithProfile(
    api,
    "altro@account-test.example",
    "Estraneo",
  );
  strangerToken = stranger.sessionToken;
});

afterAll(async () => {
  await api.close();
});

describe("BR-89: conto derivato = pricing del checkout", () => {
  it("il conto riproduce ESATTAMENTE la quote della conferma (stessa funzione)", async () => {
    const caller = await api.as(stableToken);
    // cavallo 1 in due classi, cavallo 2 in una: 3 iscrizioni, 2 cavalli
    const { entries } = await caller.entries.bulkCreate({
      stableId,
      items: [
        { classId: classAId, horseId: horse1, riderId },
        { classId: classBId, horseId: horse1, riderId },
        { classId: classAId, horseId: horse2, riderId },
      ],
    });
    const confirmed = await caller.entries.confirm({
      entryIds: entries.map((e) => e.entryId),
    });
    confirmQuote = confirmed.quote;
    // 100+80+100 = 280 di classi, 2 cavalli × 15 = 30 → 310
    expect(confirmQuote.total).toBe(310);

    const accounts = await caller.account.byStable({ stableId });
    const acc = accounts.find((a) => a.eventId === eventId);
    expect(acc).toBeDefined();
    expect(acc!.quote).toEqual(confirmQuote);
    expect(acc!.rows).toHaveLength(3);
  });

  it("le bozze NON sono conto: la fee matura solo alla conferma (BR-03)", async () => {
    const caller = await api.as(stableToken);
    // bozza non confermata sul cavallo 2 in classe B
    await caller.entries.bulkCreate({
      stableId,
      items: [{ classId: classBId, horseId: horse2, riderId }],
    });
    const accounts = await caller.account.byStable({ stableId });
    const acc = accounts.find((a) => a.eventId === eventId)!;
    expect(acc.quote.total).toBe(310); // invariato
    expect(acc.rows.every((r) => r.status !== "bozza")).toBe(true);
  });

  it("lo scratch NON cambia il totale (quota dovuta, BR-17) e resta visibile", async () => {
    const caller = await api.as(stableToken);
    const mine = await caller.entries.byStable({ stableId });
    const target = mine.find(
      (m) => m.horseName === "Book Keeper" && m.status === "confermata",
    )!;
    scratchedEntryId = target.entryId;
    await caller.entries.scratch({ entryId: target.entryId });

    const accounts = await caller.account.byStable({ stableId });
    const acc = accounts.find((a) => a.eventId === eventId)!;
    expect(acc.quote.total).toBe(310); // il ritiro non scala nulla
    expect(acc.rows.find((r) => r.entryId === target.entryId)!.status).toBe(
      "ritirata",
    );
  });

  it("lo storico viene dall'audit append-only: conferme e ritiro, in ordine", async () => {
    const caller = await api.as(stableToken);
    const accounts = await caller.account.byStable({ stableId });
    const acc = accounts.find((a) => a.eventId === eventId)!;
    const actions = acc.history.map((h) => h.action);
    expect(actions.filter((a) => a === "entry.confirm")).toHaveLength(3);
    expect(actions.filter((a) => a === "entry.scratch")).toHaveLength(1);
    // append-only: il ritiro è DOPO le conferme, con cavallo e classe
    expect(actions.at(-1)).toBe("entry.scratch");
    expect(acc.history.at(-1)!.horseName).toBe("Book Keeper");
    // e le righe d'audit esistono davvero a DB (BR-71)
    const audited = await api.db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, "entry.scratch"));
    expect(audited.some((a) => a.entityId === scratchedEntryId)).toBe(true);
  });
});

describe("BR-89: guardie di perimetro", () => {
  it("FORBIDDEN cross-scuderia: un estraneo non vede il conto altrui", async () => {
    const caller = await api.as(strangerToken);
    await expect(caller.account.byStable({ stableId })).rejects.toThrow(
      /FORBIDDEN/,
    );
  });

  it("la scuderia NON vede i conti dell'evento (vista regia)", async () => {
    const caller = await api.as(stableToken);
    await expect(caller.account.byEvent({ eventId })).rejects.toThrow(
      /FORBIDDEN/,
    );
  });

  it("la regia vede i conti per scuderia, con gli stessi numeri derivati", async () => {
    const caller = await api.as(organizerToken);
    const rows = await caller.account.byEvent({ eventId });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.stableName).toBe("Conto Team");
    expect(rows[0]!.total).toBe(confirmQuote.total);
    expect(rows[0]!.horses).toBe(2);
    expect(rows[0]!.enrollments).toBe(3);
    expect(rows[0]!.scratched).toBe(1);
  });
});

describe("BR-89: CSV del conto (naming unico, accesso a due chiavi)", () => {
  it("referente e segreteria scaricano; l'estraneo prende 403; righe raw pronte per SUM()", async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    const { buildServer } = await import("../src/server.js");
    const server = await buildServer();
    await server.ready();
    try {
      const url = `/documents/event/${eventId}/stable/${stableId}/account.csv`;
      const asStable = await server.inject({
        method: "GET",
        url,
        headers: { authorization: `Bearer ${stableToken}` },
      });
      expect(asStable.statusCode).toBe(200);
      expect(asStable.headers["content-disposition"]).toMatch(
        /^attachment; filename="Conto_ContoTeam_EventoConti2026_\d{4}-\d{2}-\d{2}\.csv"$/,
      );
      expect(asStable.body.startsWith("\uFEFF")).toBe(true);
      const lines = asStable.body.replace("\uFEFF", "").trim().split("\r\n");
      expect(lines[0]).toBe("kind;class;horse;rider;status;amount_eur");
      // 3 iscrizioni + 2 righe horse_fee — la somma è il totale derivato
      expect(lines).toHaveLength(1 + 3 + 2);
      const sum = lines
        .slice(1)
        .reduce((s, l) => s + Number(l.split(";").at(-1)), 0);
      expect(sum).toBe(310);
      // lo scratch è in chiaro, non nascosto
      expect(asStable.body).toMatch(/ritirata/);

      const asOrg = await server.inject({
        method: "GET",
        url,
        headers: { authorization: `Bearer ${organizerToken}` },
      });
      expect(asOrg.statusCode).toBe(200);

      const asStranger = await server.inject({
        method: "GET",
        url,
        headers: { authorization: `Bearer ${strangerToken}` },
      });
      expect(asStranger.statusCode).toBe(403);
      const anon = await server.inject({ method: "GET", url });
      expect(anon.statusCode).toBe(403);
    } finally {
      await server.close();
    }
  });
});
