import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@penrunner/db";
import { computeCardScore } from "@penrunner/core";
import {
  buildResultsDoc,
  buildScoreCardDoc,
  buildStartListDoc,
  buildPayoutDoc,
} from "../src/documents/model.js";
import { renderScoreCard, renderTable } from "../src/documents/render.js";
import { extractToken } from "../src/services/mailer.js";
import {
  registerUserWithProfile,
  setupApi,
  TEST_DATABASE_URL,
  type TestApi,
} from "./helpers.js";

// ---------------------------------------------------------------------------
// Step 7: payout derivato (con quadratura), documenti PDF (numeri esatti dal
// document-model + smoke del renderer), totale PDF = motore, badge testuale.
// ---------------------------------------------------------------------------

let api: TestApi;
let organizerToken: string;
let judgeSessionToken: string;
let judgeId: string;
let eventId: string;
let classId: string;
const runByDraw = new Map<number, string>();

function card(clientCardId: string, runId: string, q1: number, signed = false) {
  return {
    clientCardId,
    runId,
    judgeId,
    maneuvers: Array.from({ length: 7 }, (_, i) => ({
      position: i + 1,
      quality: i === 0 ? q1 : 0,
      penalty: 0,
    })),
    runPenalty: 0,
    special: null,
    status: (signed ? "firmata" : "chiusa") as "chiusa" | "firmata",
    closedAt: new Date().toISOString(),
    displayedTotal: 70 + q1,
    engineVersion: "1.0.0",
    signedAt: signed ? new Date().toISOString() : null,
    signatureStroke: null,
  };
}

async function judgeSync(cards: unknown[]) {
  const judge = await api.as(judgeSessionToken);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return judge.scoring.sync({ engineVersion: "1.0.0", cards, events: [] } as any);
}

const PDF_MAGIC = "%PDF-";

beforeAll(async () => {
  api = await setupApi();
  const organizer = await registerUserWithProfile(api, "club@example.com", "Club");
  organizerToken = organizer.sessionToken;
  let caller = await api.as(organizerToken);
  const { organizationId } = await caller.org.create({ name: "Club Payout" });
  const admin = await registerUserWithProfile(api, "staff@penrunner.example", "Staff");
  await api.db
    .update(schema.users)
    .set({ platformAdmin: true })
    .where(eq(schema.users.id, admin.userId));
  await (await api.as(admin.sessionToken)).admin.approveOrganization({ organizationId });

  caller = await api.as(organizerToken);
  ({ eventId } = await caller.events.create({
    organizationId,
    name: "Payout Slide 2026",
    venue: "Arena",
    startDate: "2026-09-20",
    endDate: "2026-09-21",
  }));

  const [pattern6] = await api.db
    .select()
    .from(schema.patterns)
    .where(eq(schema.patterns.code, "6"));
  const [category] = await api.db
    .select()
    .from(schema.categories)
    .where(eq(schema.categories.code, "101"));
  // 6 iscritti, entry fee 30 €, added money 500 €, trofei 75 € → fascia 6-9
  const [cls] = await api.db
    .insert(schema.classes)
    .values({
      eventId,
      categoryId: category!.id,
      name: "Open payout",
      patternId: pattern6!.id,
      entryFee: "30",
      addedMoney: "500",
      trophyCost: "75",
    })
    .returning();
  classId = cls!.id;

  for (let i = 0; i < 6; i++) {
    const [p] = await api.db
      .insert(schema.persons)
      .values({ firstName: "Rider", lastName: `P${i}`, email: `riderp${i}@example.com` })
      .returning();
    const [h] = await api.db
      .insert(schema.horses)
      .values({ name: `Horse P${i}`, microchip: `380-P-${i}`, ownerId: p!.id })
      .returning();
    await api.db
      .insert(schema.entries)
      .values({ classId, horseId: h!.id, riderId: p!.id, status: "confermata" });
  }
  await caller.draw.generate({ classId });
  await caller.draw.publish({ classId });
  const rows = await api.db
    .select({ run: schema.runs, entry: schema.entries })
    .from(schema.runs)
    .innerJoin(schema.entries, eq(schema.entries.id, schema.runs.entryId))
    .where(eq(schema.entries.classId, classId));
  for (const r of rows) runByDraw.set(r.entry.drawNumber!, r.run.id);

  await caller.invite.create({
    eventId,
    role: "giudice",
    person: { firstName: "Payout", lastName: "Judge", email: "pjudge@example.com" },
  });
  const inviteToken = extractToken(api.mailer.lastTo("pjudge@example.com")!);
  const accepted = await (await api.as()).invite.accept({ token: inviteToken });
  judgeSessionToken = accepted.sessionToken;
  const [j] = await api.db
    .select()
    .from(schema.persons)
    .where(eq(schema.persons.email, "pjudge@example.com"));
  judgeId = j!.id;

  // punteggi distinti su tutte e 6 le run, firmati
  const qs = [1.5, 1, 0.5, 0, -0.5, -1];
  for (let d = 1; d <= 6; d++) {
    await judgeSync([card(`00000000-0000-4000-8000-0000000000${d}0`, runByDraw.get(d)!, qs[d - 1]!, true)]);
  }
  await caller.scoring.publishClass({ classId });
});

afterAll(async () => {
  await api.close();
});

describe("payout derivato (BR-31/BR-34 go singolo)", () => {
  it("purse scomposto e quadratura: 300+500−75−60 = 665 €, fascia 6-9 (45/35/20)", async () => {
    const caller = await api.as(organizerToken);
    const p = await caller.payout.classPayout({ classId });
    expect(p.purse).toMatchObject({
      entryFeesCents: 18000, // 6×30
      addedMoneyCents: 50000,
      trophyDeductionCents: 7500,
      orgExpenseCents: 3600, // 20% di 180
      purseCents: 56900, // 180+500−75−36
    });
    // fascia 6 cavalli → 3 posti: 45/35/20 di 569 € = 256,05 / 199,15 / 113,80
    expect(p.placements.map((x) => [x.rank, x.amountCents])).toEqual([
      [1, 25605],
      [2, 19915],
      [3, 11380],
    ]);
    // quadratura al centesimo
    expect(p.distributedCents + p.undistributedCents).toBe(p.purse.purseCents);
    expect(p.undistributedCents).toBe(0);
    // Fonte normativa confermata (ART. 15); resta UN asterisco: la base del 20%
    expect(p.purseFormulaNote).toMatch(/ART\. 15/);
    expect(p.purseFormulaNote).toMatch(/base del 20%.*da precisare/);
  });

  it("l'organizzatore altrui non vede il payout", async () => {
    const outsider = await registerUserWithProfile(api, "x@example.com", "X");
    await expect(
      (await api.as(outsider.sessionToken)).payout.classPayout({ classId }),
    ).rejects.toThrow(/FORBIDDEN/);
  });
});

describe("documenti PDF (document-model esatto + smoke renderer)", () => {
  it("start list: modello coi binomi, PDF valido", async () => {
    const doc = await buildStartListDoc(api.db, classId, "it", new Date());
    expect(doc.rows).toHaveLength(6);
    // BR-84: i documenti ufficiali rendono "Cognome Nome" (convenzione FISE).
    // I cavalieri sono firstName="Rider" lastName="P<i>" → in PDF "P<i> Rider".
    for (const row of doc.rows) {
      expect(row[2]).toMatch(/^P\d Rider$/);
    }
    const pdf = await renderTable(doc);
    expect(pdf.subarray(0, 5).toString()).toBe(PDF_MAGIC);
    expect(pdf.length).toBeGreaterThan(500);
  });

  it("GUARDIA BR-84: i documenti usano SOLO la resa ufficiale, mai quella conversazionale", async () => {
    // Contratto sul sorgente: documents/model.ts compone i nomi via helper
    // ufficiale — reintrodurre la resa "Nome Cognome" (o una concatenazione
    // a mano) rompe questo test.
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(
      new URL("../src/documents/model.ts", import.meta.url),
      "utf8",
    );
    expect(src).toContain("personOfficialNameSql");
    expect(src).toContain("riderOfficialName");
    expect(src).not.toContain("personDisplayNameSql");
    expect(src).not.toMatch(/firstName\s*\+|\+\s*lastName/);
  });

  it("classifica: badge TESTUALE inequivocabile (provvisoria vs ufficiale)", async () => {
    const provisional = await buildResultsDoc(api.db, classId, "it", new Date());
    expect(provisional.statusBadge).toMatch(/PROVVISORIA/);
    expect(provisional.official).toBe(false);
    // a finestra chiusa → ufficiale
    await api.db
      .update(schema.scoreCards)
      .set({ closedAt: new Date(Date.now() - 31 * 60_000) });
    const official = await buildResultsDoc(api.db, classId, "it", new Date());
    expect(official.statusBadge).toBe("UFFICIALE");
    expect(official.official).toBe(true);
    const pdf = await renderTable(official);
    expect(pdf.subarray(0, 5).toString()).toBe(PDF_MAGIC);
  });

  it("payout PDF: purse scomposto nelle note, con la fonte ART. 15 e l'asterisco sul 20%", async () => {
    const doc = await buildPayoutDoc(api.db, classId, "it", new Date());
    const notes = doc.footNotes.join("\n");
    expect(notes).toMatch(/Montepremi: € 569,00/);
    expect(notes).toMatch(/Iscrizioni: € 180,00/);
    expect(notes).toMatch(/ART\. 15/);
    expect(notes).toMatch(/da precisare/);
    const pdf = await renderTable(doc);
    expect(pdf.subarray(0, 5).toString()).toBe(PDF_MAGIC);
  });

  it("score card PDF: colonne = passi del pattern; TOTALE = motore (mai da colonna)", async () => {
    const run1 = runByDraw.get(1)!;
    const doc = await buildScoreCardDoc(api.db, run1, judgeId, "it", new Date());
    // Pattern 6 → 7 manovre
    expect(doc.maneuvers).toHaveLength(7);
    // il totale del documento coincide col ricalcolo indipendente del motore
    const expected = computeCardScore({
      maneuvers: Array.from({ length: 7 }, (_, i) => ({
        position: i + 1,
        quality: i === 0 ? 1.5 : 0,
        penalty: 0,
      })),
      runPenalty: 0,
      special: null,
    });
    expect(doc.total).toBe(expected.total!.toFixed(1)); // 71.5
    expect(doc.signatureLine).toMatch(/Firmata/);
    const pdf = await renderScoreCard(doc);
    expect(pdf.subarray(0, 5).toString()).toBe(PDF_MAGIC);
  });

  it("score card backfill: la firma non è simulata, il PDF mostra paper_ref", async () => {
    // una carta backfill su un secondo giudice
    const admin2 = await registerUserWithProfile(api, "seg@example.com", "Segreteria");
    // rendiamo l'utente segreteria dell'organizzazione
    const [org] = await api.db.select().from(schema.organizations).limit(1);
    await api.db.insert(schema.organizationMembers).values({
      organizationId: org!.id,
      personId: admin2.personId,
      role: "segreteria",
    });
    const [j2] = await api.db
      .insert(schema.persons)
      .values({ firstName: "Giudice", lastName: "Cartaceo" })
      .returning();
    // assegniamo j2 come giudice per far passare maybeAwaitSignature? non serve:
    // il backfill richiede solo score.backfill. Assegniamo j2 all'evento.
    await api.db.insert(schema.eventRoleAssignments).values({
      eventId,
      personId: j2!.id,
      role: "giudice",
    });
    const segCaller = await api.as(admin2.sessionToken);
    const run2 = runByDraw.get(2)!;
    const res = await segCaller.scoring.backfill({
      runId: run2,
      judgePersonId: j2!.id,
      maneuvers: Array.from({ length: 7 }, (_, i) => ({
        position: i + 1,
        quality: 0,
        penalty: 0,
      })),
      runPenalty: 0,
      special: null,
      paperRef: "Carta n.7 faldone 2026",
    });
    expect(res.total).toBe(70);
    const doc = await buildScoreCardDoc(api.db, run2, j2!.id, "it", new Date());
    expect(doc.signatureLine).toMatch(/Backfill cartaceo: Carta n.7/);
  });
});

describe("GUARDIA fase (d): nome file parlante, regola unica", () => {
  // Censimento reperto 1: il telefono salvava "document" — la route serviva
  // `inline; filename="start-list.pdf"` statico. Regola unica per i 4 doc:
  // <DocType>_<Classe>_<Evento>_<YYYY-MM-DD>.pdf in `attachment`.
  it('start list → attachment; filename="StartList_<Classe>_<Evento>_<data>.pdf"', async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    const { buildServer } = await import("../src/server.js");
    const server = await buildServer();
    await server.ready();
    try {
      const res = await server.inject({
        method: "GET",
        url: `/documents/class/${classId}/start-list.pdf`,
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toBe("application/pdf");
      // "Open payout" + "Payout Slide 2026" → slug PascalCase, data ISO
      expect(res.headers["content-disposition"]).toMatch(
        /^attachment; filename="StartList_OpenPayout_PayoutSlide2026_\d{4}-\d{2}-\d{2}\.pdf"$/,
      );
      expect(res.rawPayload.subarray(0, 5).toString()).toBe(PDF_MAGIC);
    } finally {
      await server.close();
    }
  });

  it("B4: CSV coi dati grezzi — intestazioni stabili, BOM, stesso naming, payout gated", async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    const { buildServer } = await import("../src/server.js");
    const server = await buildServer();
    await server.ready();
    try {
      const res = await server.inject({
        method: "GET",
        url: `/documents/class/${classId}/results.csv`,
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toMatch(/^text\/csv/);
      expect(res.headers["content-disposition"]).toMatch(
        /^attachment; filename="Results_OpenPayout_PayoutSlide2026_\d{4}-\d{2}-\d{2}\.csv"$/,
      );
      // BOM per Excel + intestazioni STABILI (contratto macchina, mai localizzate)
      expect(res.body.startsWith("\uFEFF")).toBe(true);
      const lines = res.body.replace("\uFEFF", "").trim().split("\r\n");
      expect(lines[0]).toBe("position;horse;rider;score;outcome;state");
      expect(lines).toHaveLength(1 + 6); // 6 binomi in classifica
      // separatore alternativo a richiesta
      const comma = await server.inject({
        method: "GET",
        url: `/documents/class/${classId}/results.csv?sep=,`,
      });
      expect(comma.body).toContain("position,horse,rider");
      // stessa visibilità dei PDF: il payout resta gated
      const anonPayout = await server.inject({
        method: "GET",
        url: `/documents/class/${classId}/payout.csv`,
      });
      expect(anonPayout.statusCode).toBe(403);
    } finally {
      await server.close();
    }
  });

  it("B4: quoting RFC 4180 — separatori e virgolette nei nomi non rompono le colonne", async () => {
    const { csvString } = await import("../src/documents/csv.js");
    const out = csvString(
      { headers: ["a", "b"], rows: [["x;y", 'Nome "Strano"'], [null, 3.5]] },
      ";",
    );
    expect(out).toBe('\uFEFFa;b\r\n"x;y";"Nome ""Strano"""\r\n;3.5\r\n');
  });
});
