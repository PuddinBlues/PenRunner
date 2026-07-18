import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@penrunner/db";
import {
  ScribeStore,
  type StorageAdapter,
  type SyncPayload,
} from "@penrunner/core";
import { extractToken } from "../src/services/mailer.js";
import {
  expectDbError,
  registerUserWithProfile,
  setupApi,
  type TestApi,
} from "./helpers.js";

// ---------------------------------------------------------------------------
// Scoring offline-first end-to-end: bundle → compilazione offline → chiusura
// (annuncio provvisorio) → sync idempotente → firma batch → validazione.
// Più: riapertura pre-firma, held for review (BR-29), conflitto two-device,
// mismatch motore mai silenzioso, clock skew, backfill BR-28, correzioni
// BR-40 con storia per carta.
// ---------------------------------------------------------------------------

class MemoryAdapter implements StorageAdapter {
  snapshot: string | null = null;
  async load() {
    return this.snapshot;
  }
  async save(s: string) {
    this.snapshot = s;
  }
}

function makeIds(prefix: string) {
  let n = 0;
  // uuid v4 sintetici deterministici (validi per zod .uuid())
  return () =>
    `00000000-0000-4000-8000-${prefix}${String(++n).padStart(12 - prefix.length, "0")}`;
}
function makeClock() {
  let t = 0;
  return () => new Date(Date.UTC(2026, 8, 1, 10, 0, ++t)).toISOString();
}

let api: TestApi;
let organizerToken: string;
let judgeSessionToken: string;
let judge1Id: string;
let judge2Id: string;
let orgId: string;
let eventId: string;
let classId: string;
let run1Id: string;
let run2Id: string;
let run3Id: string;
let store: ScribeStore;

const QUALITIES = [0.5, 0, 0.5, 0, -0.5, 1, 0]; // Σ = +1.5

async function runByDraw(drawNumber: number): Promise<string> {
  const [row] = await api.db
    .select({ runId: schema.runs.id })
    .from(schema.runs)
    .innerJoin(schema.entries, eq(schema.entries.id, schema.runs.entryId))
    .where(eq(schema.entries.drawNumber, drawNumber));
  return row!.runId;
}

async function dbCard(clientCardId: string) {
  const [card] = await api.db
    .select()
    .from(schema.scoreCards)
    .where(eq(schema.scoreCards.clientCardId, clientCardId));
  return card;
}

async function auditRows(action: string) {
  return api.db
    .select()
    .from(schema.auditLog)
    .where(eq(schema.auditLog.action, action))
    .orderBy(asc(schema.auditLog.occurredAt));
}

beforeAll(async () => {
  api = await setupApi();

  const organizer = await registerUserWithProfile(
    api,
    "club@example.com",
    "Referente Club",
  );
  organizerToken = organizer.sessionToken;
  let caller = await api.as(organizerToken);
  ({ organizationId: orgId } = await caller.org.create({ name: "Club Scoring" }));
  const admin = await registerUserWithProfile(
    api,
    "staff@penrunner.example",
    "Staff",
  );
  await api.db
    .update(schema.users)
    .set({ platformAdmin: true })
    .where(eq(schema.users.id, admin.userId));
  await (await api.as(admin.sessionToken)).admin.approveOrganization({
    organizationId: orgId,
  });

  caller = await api.as(organizerToken);
  ({ eventId } = await caller.events.create({
    organizationId: orgId,
    name: "Scoring Slide 2026",
    venue: "Arena",
    startDate: "2026-09-01",
    endDate: "2026-09-02",
  }));

  const [pattern6] = await api.db
    .select()
    .from(schema.patterns)
    .where(eq(schema.patterns.code, "6"));
  const [category] = await api.db
    .select()
    .from(schema.categories)
    .where(eq(schema.categories.code, "101"));
  const [cls] = await api.db
    .insert(schema.classes)
    .values({
      eventId,
      categoryId: category!.id,
      name: "Open scoring",
      patternId: pattern6!.id,
      judgesCount: 1,
    })
    .returning();
  classId = cls!.id;

  // 3 binomi confermati → draw → pubblicazione (crea le run)
  for (let i = 0; i < 3; i++) {
    const [p] = await api.db
      .insert(schema.persons)
      .values({ fullName: `Rider S${i}` })
      .returning();
    const [h] = await api.db
      .insert(schema.horses)
      .values({ name: `Horse S${i}`, microchip: `380-S-${i}`, ownerId: p!.id })
      .returning();
    await api.db
      .insert(schema.entries)
      .values({ classId, horseId: h!.id, riderId: p!.id, status: "confermata" });
  }
  await caller.draw.generate({ classId });
  await caller.draw.publish({ classId });
  run1Id = await runByDraw(1);
  run2Id = await runByDraw(2);
  run3Id = await runByDraw(3);

  // giudice titolare (sessione scoped) + secondo giudice (assegnato dopo)
  await caller.invite.create({
    eventId,
    role: "giudice",
    person: { fullName: "Judge One", email: "judge1@example.com" },
  });
  const inviteToken = extractToken(api.mailer.lastTo("judge1@example.com")!);
  const anon = await api.as();
  const accepted = await anon.invite.accept({ token: inviteToken });
  judgeSessionToken = accepted.sessionToken;
  const [j1] = await api.db
    .select()
    .from(schema.persons)
    .where(eq(schema.persons.email, "judge1@example.com"));
  judge1Id = j1!.id;

  store = await ScribeStore.open(new MemoryAdapter(), makeIds("a"), makeClock());
});

afterAll(async () => {
  await api.close();
});

async function syncAs(token: string, payload: SyncPayload) {
  const caller = await api.as(token);
  return caller.scoring.sync(payload);
}

describe("bundle e ciclo offline (run 1)", () => {
  let cardId: string;

  it("il bundle contiene tutto per lavorare la classe senza rete", async () => {
    const judge = await api.as(judgeSessionToken);
    const bundle = await judge.scoring.bundle({ eventId });
    expect(bundle.classes).toHaveLength(1);
    expect(
      bundle.maneuvers.filter((m) => m.patternId === bundle.classes[0]!.patternId),
    ).toHaveLength(7); // Pattern 6
    expect(bundle.runs).toHaveLength(3);
    expect(bundle.engineVersion).toBeTruthy();
    // e a un utente estraneo è negato
    const outsider = await registerUserWithProfile(
      api,
      "estraneo@example.com",
      "Estraneo",
    );
    await expect(
      (await api.as(outsider.sessionToken)).scoring.bundle({ eventId }),
    ).rejects.toThrow(/FORBIDDEN/);
  });

  it("chiusura → sync → il live ha il punteggio PROVVISORIO (BR-27) e la run avanza", async () => {
    cardId = await store.createCard(run1Id, judge1Id, 7);
    await store.sendToField(run1Id);
    for (const [i, q] of QUALITIES.entries()) {
      await store.setQuality(cardId, i + 1, q);
    }
    await store.setPenalty(cardId, 2, 1);
    const display = await store.closeCard(cardId);
    expect(display.breakdown.total).toBe(70.5); // 70 + 1.5 − 1

    const payload = store.buildSyncPayload();
    const res = await syncAs(judgeSessionToken, payload);
    expect(res.cards[0]).toMatchObject({ result: "applied", serverTotal: 70.5 });
    expect(res.events.every((e) => e.result === "applied")).toBe(true);
    await store.markSynced({
      cards: [cardId],
      events: payload.events.map((e) => e.clientEventId),
    });

    const [run] = await api.db
      .select()
      .from(schema.runs)
      .where(eq(schema.runs.id, run1Id));
    expect(run!.status).toBe("in_attesa_firma"); // unico giudice: tutte chiuse
    expect(run!.startedAt).not.toBeNull(); // àncora ETA dal "manda in campo"

    const org = await api.as(organizerToken);
    const live = await org.scoring.runCards({ runId: run1Id });
    expect(live.cards[0]!.total).toBe(70.5);
    expect(live.cards[0]!.card.status).toBe("chiusa"); // provvisorio, non firmato
  });

  it("il retry dello stesso payload è un duplicato senza effetti", async () => {
    const payload = store.buildSyncPayload(); // vuoto: ricostruiamo il payload originale
    expect(payload.cards).toHaveLength(0);
    // ri-mandiamo la carta com'è sul device (stessa clientCardId, stessa firma di stato)
    const again: SyncPayload = {
      engineVersion: "1.0.0",
      cards: [
        {
          ...storeCardPayload(cardId),
        },
      ],
      events: [],
    };
    const res = await syncAs(judgeSessionToken, again);
    expect(["duplicate", "applied"]).toContain(res.cards[0]!.result);
    const rows = await api.db
      .select()
      .from(schema.scoreCards)
      .where(eq(schema.scoreCards.runId, run1Id));
    expect(rows).toHaveLength(1);
  });

  it("riapertura pre-firma: stessa carta, evento tracciato, richiusura come update", async () => {
    await store.reopenCard(cardId);
    await store.setQuality(cardId, 1, 1); // 0.5 → 1
    const display = await store.closeCard(cardId);
    expect(display.breakdown.total).toBe(71);

    const payload = store.buildSyncPayload();
    const res = await syncAs(judgeSessionToken, payload);
    expect(res.cards[0]).toMatchObject({ result: "applied", serverTotal: 71 });
    await store.markSynced({
      cards: [cardId],
      events: payload.events.map((e) => e.clientEventId),
    });

    const rows = await api.db
      .select()
      .from(schema.scoreCards)
      .where(eq(schema.scoreCards.runId, run1Id));
    expect(rows).toHaveLength(1); // sempre la stessa carta
    expect((await auditRows("scorecard.reopened")).length).toBe(1);
  });

  it("validazione negata senza firma: la chiusura annuncia, non ufficializza", async () => {
    const org = await api.as(organizerToken);
    await expect(org.scoring.validateRun({ runId: run1Id })).rejects.toThrow(
      /richiede la firma/,
    );
  });

  it("firma in batch col tratto → immutabile: un nuovo contenuto è conflict_immutable", async () => {
    await store.signBatch([{ clientCardId: cardId, signatureStroke: "M0,0L5,5" }]);
    const payload = store.buildSyncPayload();
    const res = await syncAs(judgeSessionToken, payload);
    expect(res.cards[0]!.result).toBe("applied");
    await store.markSynced({ cards: [cardId] });

    const card = await dbCard(cardId);
    expect(card).toMatchObject({
      status: "firmata",
      signatureStroke: "M0,0L5,5",
      engineMismatch: false,
    });
    expect(card!.signedAt).not.toBeNull();

    // post-firma: un payload con contenuto diverso NON sovrascrive
    const tampered = storeCardPayload(cardId);
    tampered.maneuvers = tampered.maneuvers.map((m) => ({ ...m, quality: 1.5 }));
    tampered.signedAt = new Date().toISOString();
    const res2 = await syncAs(judgeSessionToken, {
      engineVersion: "1.0.0",
      cards: [tampered],
      events: [],
    });
    expect(res2.cards[0]!.result).toBe("conflict_immutable");

    const org = await api.as(organizerToken);
    await org.scoring.validateRun({ runId: run1Id });
    const [run] = await api.db
      .select()
      .from(schema.runs)
      .where(eq(schema.runs.id, run1Id));
    expect(run!.status).toBe("validata");
  });
});

describe("held for review (BR-29) — run 2", () => {
  let cardId: string;

  it("held è un evento di run: il live mostra 'in review', la carta resta sul device", async () => {
    cardId = await store.createCard(run2Id, judge1Id, 7);
    await store.sendToField(run2Id);
    await store.holdForReview(run2Id, "Back: 4 o 5 passi → −2 oppure score 0");
    const payload = store.buildSyncPayload();
    expect(payload.cards).toHaveLength(0); // solo eventi
    const res = await syncAs(judgeSessionToken, payload);
    expect(res.events.every((e) => e.result === "applied")).toBe(true);
    await store.markSynced({
      events: payload.events.map((e) => e.clientEventId),
    });

    const org = await api.as(organizerToken);
    const live = await org.scoring.runCards({ runId: run2Id });
    expect(live.inReview).toBe(true);
    expect(live.reviewNote).toMatch(/4 o 5 passi/);
    expect(live.cards).toHaveLength(0);
  });

  it("risoluzione: UN valore, chiusura (annuncio) — ma resta in review finché non firmata", async () => {
    for (const [i, q] of QUALITIES.entries()) {
      await store.setQuality(cardId, i + 1, q);
    }
    await store.setPenalty(cardId, 4, 2); // il dubbio si risolve: −2
    const display = await store.closeCard(cardId);
    expect(display.breakdown.total).toBe(69.5);
    const payload = store.buildSyncPayload();
    await syncAs(judgeSessionToken, payload);
    await store.markSynced({
      cards: [cardId],
      events: payload.events.map((e) => e.clientEventId),
    });

    const org = await api.as(organizerToken);
    const live = await org.scoring.runCards({ runId: run2Id });
    expect(live.cards[0]!.total).toBe(69.5);
    expect(live.inReview).toBe(true); // chiusa ma non firmata (BR-29)
    await expect(org.scoring.validateRun({ runId: run2Id })).rejects.toThrow();
  });

  it("la correzione pre-firma non esiste: su una carta chiusa si riapre (BR-27)", async () => {
    const card = await dbCard(cardId);
    const org = await api.as(organizerToken);
    await expect(
      org.scoring.correct({
        scoreCardId: card!.id,
        runPenalty: 5,
        reason: "tentativo su carta non firmata",
      }),
    ).rejects.toThrow(/prima della firma si riapre/);
  });

  it("firma → la review si chiude, la validazione passa", async () => {
    await store.signBatch([{ clientCardId: cardId }]);
    const payload = store.buildSyncPayload();
    await syncAs(judgeSessionToken, payload);
    await store.markSynced({ cards: [cardId] });

    const org = await api.as(organizerToken);
    const live = await org.scoring.runCards({ runId: run2Id });
    expect(live.inReview).toBe(false);
    await org.scoring.validateRun({ runId: run2Id });
  });
});

describe("conflitto two-device, mismatch e clock skew — run 3", () => {
  it("multi-giudice: run in review finché ANCHE il secondo giudice non firma", async () => {
    const org = await api.as(organizerToken);
    await org.invite.create({
      eventId,
      role: "giudice",
      person: { fullName: "Judge Two", email: "judge2@example.com" },
    });
    const [j2] = await api.db
      .select()
      .from(schema.persons)
      .where(eq(schema.persons.email, "judge2@example.com"));
    judge2Id = j2!.id;

    // held sollevato sulla run 3
    const holdPayload: SyncPayload = {
      engineVersion: "1.0.0",
      cards: [],
      events: [
        {
          clientEventId: "hold-3",
          runId: run3Id,
          type: "held_for_review",
          at: new Date().toISOString(),
          note: "spin: 4 o 4¼?",
        },
      ],
    };
    await syncAs(judgeSessionToken, holdPayload);

    // giudice 1 chiude e firma direttamente (payload composto sul device)
    const res = await syncAs(judgeSessionToken, {
      engineVersion: "1.0.0",
      cards: [
        rawCard("00000000-0000-4000-8000-cccccccc0001", run3Id, judge1Id, {
          displayedTotal: 70,
          signedAt: new Date(Date.now() - 60_000).toISOString(),
        }),
      ],
      events: [],
    });
    expect(res.cards[0]!.result).toBe("applied");
    const live = await (await api.as(organizerToken)).scoring.runCards({
      runId: run3Id,
    });
    expect(live.inReview).toBe(true); // manca la firma del giudice 2
  });

  it("mismatch motore: mai silenzioso — audit, flag e validazione bloccata", async () => {
    // il giudice 2 arriva con un totale mostrato SBAGLIATO (motore divergente)
    const res = await syncAs(judgeSessionToken, {
      engineVersion: "0.9.0-divergente",
      cards: [
        rawCard("00000000-0000-4000-8000-cccccccc0002", run3Id, judge2Id, {
          displayedTotal: 99, // il server ricalcola 70
          signedAt: new Date(Date.now() + 10 * 60_000).toISOString(), // e l'orologio è avanti
        }),
      ],
      events: [],
    });
    expect(res.cards[0]).toMatchObject({ result: "applied", serverTotal: 70 });

    const card = await dbCard("00000000-0000-4000-8000-cccccccc0002");
    expect(card!.engineMismatch).toBe(true);
    expect((await auditRows("scorecard.engine_mismatch")).length).toBe(1);
    expect((await auditRows("scorecard.clock_skew")).length).toBe(1);

    const org = await api.as(organizerToken);
    // tutte firmate → niente review; ma il mismatch blocca l'auto-validazione
    const live = await org.scoring.runCards({ runId: run3Id });
    expect(live.inReview).toBe(false);
    await expect(org.scoring.validateRun({ runId: run3Id })).rejects.toThrow(
      /mai silenzioso|Mismatch/,
    );
    // decisione esplicita dell'organizzatore, auditata
    await org.scoring.validateRun({ runId: run3Id, acknowledgeMismatch: true });
    expect((await auditRows("scorecard.mismatch_acknowledged")).length).toBe(1);
  });

  it("two-device: la seconda carta per lo stesso slot è un conflitto agli atti", async () => {
    const res = await syncAs(judgeSessionToken, {
      engineVersion: "1.0.0",
      cards: [
        rawCard("00000000-0000-4000-8000-cccccccc0003", run3Id, judge1Id, {
          displayedTotal: 70,
        }),
      ],
      events: [],
    });
    expect(res.cards[0]!.result).toBe("conflict");
    const conflicts = await auditRows("scorecard.sync_conflict");
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.note).toMatch(/decisione dell'organizzatore/);
  });

  it("la sync richiede una sessione giudice/scribe", async () => {
    await expect(
      syncAs(organizerToken, { engineVersion: "1.0.0", cards: [], events: [] }),
    ).rejects.toThrow(/sessione giudice\/scribe/);
  });
});

describe("backfill BR-28 e correzioni BR-40 — run 4 (late entry)", () => {
  let run4Id: string;
  let backfillCardId: string;

  it("il backfill è di organizzatore/segreteria, auditato, con paper_ref", async () => {
    const org = await api.as(organizerToken);
    const [p] = await api.db
      .insert(schema.persons)
      .values({ fullName: "Late Rider" })
      .returning();
    const [h] = await api.db
      .insert(schema.horses)
      .values({ name: "Late Horse", microchip: "380-S-LATE", ownerId: p!.id })
      .returning();
    const late = await org.draw.addLateEntry({
      classId,
      horseId: h!.id,
      riderId: p!.id,
    });
    const [runRow] = await api.db
      .select()
      .from(schema.runs)
      .where(eq(schema.runs.entryId, late.entryId));
    run4Id = runRow!.id;

    // un utente qualsiasi non può
    const outsider = await registerUserWithProfile(
      api,
      "estraneo2@example.com",
      "Estraneo Due",
    );
    await expect(
      (await api.as(outsider.sessionToken)).scoring.backfill({
        runId: run4Id,
        judgePersonId: judge1Id,
        maneuvers: QUALITIES.map((q, i) => ({
          position: i + 1,
          quality: q,
          penalty: 0,
        })),
        runPenalty: 0,
        special: null,
        paperRef: "x",
      }),
    ).rejects.toThrow(/FORBIDDEN/);

    const res = await org.scoring.backfill({
      runId: run4Id,
      judgePersonId: judge1Id,
      maneuvers: QUALITIES.map((q, i) => ({
        position: i + 1,
        quality: q,
        penalty: i === 1 ? 1 : 0,
      })),
      runPenalty: 0,
      special: null,
      paperRef: "Carta cartacea n. 12, faldone 4ª tappa, firmata agli atti",
    });
    expect(res.total).toBe(70.5);
    backfillCardId = res.scoreCardId;

    const [card] = await api.db
      .select()
      .from(schema.scoreCards)
      .where(eq(schema.scoreCards.id, backfillCardId));
    expect(card).toMatchObject({
      source: "manual_backfill",
      status: "firmata",
      signedAt: null, // la firma digitale non si simula MAI
      signatureStroke: null,
    });
    expect(card!.paperRef).toMatch(/faldone/);
    expect((await auditRows("scorecard.backfill")).length).toBe(1);
  });

  it("vincolo DB: una carta backfill con firma digitale è impossibile", async () => {
    await expectDbError(
      api.db.insert(schema.scoreCards).values({
        runId: run4Id,
        judgeId: judge2Id,
        source: "manual_backfill",
        paperRef: "carta X",
        status: "firmata",
        signedAt: new Date(), // vietato: la firma non si simula
        closedAt: new Date(),
      }),
      /score_cards_signature_source/,
    );
  });

  it("correzione BR-40: snapshot prima/dopo in audit, storia per carta", async () => {
    const org = await api.as(organizerToken);
    await org.scoring.correct({
      scoreCardId: backfillCardId,
      runPenalty: 5,
      reason: "Errore di trascrizione dalla carta: penalità di run mancante",
    });
    const live = await org.scoring.runCards({ runId: run4Id });
    expect(live.cards[0]!.total).toBe(65.5); // 70.5 − 5, sempre ricalcolato

    const corrections = await auditRows("scorecard.correct");
    expect(corrections).toHaveLength(1);
    expect(corrections[0]!.before).toMatchObject({ runPenalty: "0.0" });
    expect(corrections[0]!.after).toMatchObject({ runPenalty: 5 });
    expect(corrections[0]!.note).toMatch(/trascrizione/);

    // la storia della carta è interrogabile PER CARTA
    const history = await org.scoring.cardHistory({
      scoreCardId: backfillCardId,
    });
    expect(history.map((h) => h.action)).toEqual([
      "scorecard.backfill",
      "scorecard.correct",
    ]);
  });
});

// -- helper per payload costruiti a mano ------------------------------------

function storeCardPayload(clientCardId: string) {
  const payload = storeSnapshotCard(clientCardId);
  return payload;
}

function storeSnapshotCard(clientCardId: string) {
  const card = store.card(clientCardId);
  return {
    clientCardId: card.clientCardId,
    runId: card.runId,
    judgeId: card.judgeId,
    maneuvers: card.maneuvers,
    runPenalty: card.runPenalty,
    special: card.special,
    status: card.status as "chiusa" | "firmata",
    closedAt: card.closedAt!,
    displayedTotal: card.displayedTotal,
    engineVersion: "1.0.0",
    signedAt: card.signedAt,
    signatureStroke: card.signatureStroke,
  };
}

function rawCard(
  clientCardId: string,
  runId: string,
  judgeId: string,
  opts: { displayedTotal: number; signedAt?: string },
) {
  return {
    clientCardId,
    runId,
    judgeId,
    maneuvers: Array.from({ length: 7 }, (_, i) => ({
      position: i + 1,
      quality: 0,
      penalty: 0,
    })),
    runPenalty: 0,
    special: null,
    status: (opts.signedAt ? "firmata" : "chiusa") as "chiusa" | "firmata",
    closedAt: new Date(Date.now() - 120_000).toISOString(),
    displayedTotal: opts.displayedTotal,
    engineVersion: "1.0.0",
    signedAt: opts.signedAt ?? null,
    signatureStroke: null,
  };
}
