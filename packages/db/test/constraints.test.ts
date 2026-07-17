import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  categories,
  classes,
  entries,
  events,
  horses,
  maneuverScores,
  patternManeuvers,
  patterns,
  persons,
  runs,
  scoreCards,
} from "../src/schema/index.js";
import {
  expectConstraintViolation,
  setupTestDb,
  truncateOperationalTables,
} from "./helpers.js";

let ctx: Awaited<ReturnType<typeof setupTestDb>>;

// Fixture minima: evento → classe (Pattern 6) → entry → run → score card.
let classId: string;
let horseId: string;
let riderId: string;
let judgeId: string;
let scoreCardId: string;
let firstManeuverId: string;
let secondManeuverId: string;

beforeAll(async () => {
  ctx = await setupTestDb();
  await truncateOperationalTables(ctx.db);
  const { db } = ctx;

  const [p6] = await db.select().from(patterns).where(eq(patterns.code, "6"));
  const p6Maneuvers = await db
    .select()
    .from(patternManeuvers)
    .where(eq(patternManeuvers.patternId, p6!.id))
    .orderBy(asc(patternManeuvers.position));
  firstManeuverId = p6Maneuvers[0]!.id;
  secondManeuverId = p6Maneuvers[1]!.id;
  const [category] = await db
    .select()
    .from(categories)
    .where(eq(categories.code, "101"));

  const [event] = await db
    .insert(events)
    .values({
      name: "Evento di test",
      venue: "Arena di test",
      startDate: "2026-05-01",
      endDate: "2026-05-03",
    })
    .returning();

  const [cls] = await db
    .insert(classes)
    .values({
      eventId: event!.id,
      categoryId: category!.id,
      name: "Classe di test",
      patternId: p6!.id,
    })
    .returning();
  classId = cls!.id;

  const inserted = await db
    .insert(persons)
    .values([
      { fullName: "Rider Test" },
      { fullName: "Owner Test" },
      { fullName: "Giudice Test" },
    ])
    .returning();
  riderId = inserted[0]!.id;
  judgeId = inserted[2]!.id;

  const [horse] = await db
    .insert(horses)
    .values({ name: "Cavallo Test", microchip: "380271000000001", ownerId: inserted[1]!.id })
    .returning();
  horseId = horse!.id;

  const [entry] = await db
    .insert(entries)
    .values({ classId, horseId, riderId, drawNumber: 1 })
    .returning();

  const [run] = await db
    .insert(runs)
    .values({ entryId: entry!.id })
    .returning();

  const [card] = await db
    .insert(scoreCards)
    .values({ runId: run!.id, judgeId })
    .returning();
  scoreCardId = card!.id;
});

afterAll(async () => {
  await truncateOperationalTables(ctx.db);
  await ctx.pool.end();
});

describe("vincoli di dominio nel database", () => {
  it("persons.locale ha default it (BR-62)", async () => {
    const [rider] = await ctx.db
      .select()
      .from(persons)
      .where(eq(persons.id, riderId));
    expect(rider!.locale).toBe("it");
  });

  it("BR-21: qualità fuori scala o fuori passo 0.5 rifiutata", async () => {
    for (const quality of ["1.7", "-2", "0.8"]) {
      await expectConstraintViolation(
        ctx.db.insert(maneuverScores).values({
          scoreCardId,
          maneuverId: firstManeuverId,
          quality,
        }),
        "maneuver_scores_quality_range",
      );
    }
  });

  it("BR-21: qualità valide accettate (estremi e passo 0.5)", async () => {
    const inserted = await ctx.db
      .insert(maneuverScores)
      .values({ scoreCardId, maneuverId: firstManeuverId, quality: "-1.5", penalty: "0.5" })
      .returning();
    expect(inserted[0]!.quality).toBe("-1.5");
    await ctx.db
      .delete(maneuverScores)
      .where(eq(maneuverScores.id, inserted[0]!.id));
  });

  it("BR-22: penalità di manovra negativa rifiutata", async () => {
    await expectConstraintViolation(
      ctx.db.insert(maneuverScores).values({
        scoreCardId,
        maneuverId: secondManeuverId,
        penalty: "-1",
      }),
      "maneuver_scores_penalty_non_negative",
    );
  });

  it("una sola riga per manovra nella stessa carta", async () => {
    await ctx.db
      .insert(maneuverScores)
      .values({ scoreCardId, maneuverId: firstManeuverId });
    await expectConstraintViolation(
      ctx.db
        .insert(maneuverScores)
        .values({ scoreCardId, maneuverId: firstManeuverId }),
      "maneuver_scores_card_maneuver",
    );
  });

  it("run_penalty negativa rifiutata", async () => {
    await expectConstraintViolation(
      ctx.db
        .update(scoreCards)
        .set({ runPenalty: "-5" })
        .where(eq(scoreCards.id, scoreCardId)),
      "score_cards_run_penalty_non_negative",
    );
  });

  it("BR-40: una carta non può dirsi firmata senza timestamp di firma", async () => {
    await expectConstraintViolation(
      ctx.db
        .update(scoreCards)
        .set({ status: "firmata" })
        .where(eq(scoreCards.id, scoreCardId)),
      "score_cards_signed_has_timestamp",
    );

    await ctx.db
      .update(scoreCards)
      .set({ status: "firmata", signedAt: new Date() })
      .where(eq(scoreCards.id, scoreCardId));
    const [card] = await ctx.db
      .select()
      .from(scoreCards)
      .where(eq(scoreCards.id, scoreCardId));
    expect(card!.status).toBe("firmata");
  });

  it("BR-11: lo stesso cavallo non si iscrive due volte alla stessa classe", async () => {
    await expectConstraintViolation(
      ctx.db.insert(entries).values({ classId, horseId, riderId }),
      "entries_class_horse",
    );
  });

  it("il draw non ammette doppioni nella stessa classe, ma ammette buchi (null)", async () => {
    const [otherOwner] = await ctx.db
      .insert(persons)
      .values({ fullName: "Owner 2" })
      .returning();
    const [horse2] = await ctx.db
      .insert(horses)
      .values({ name: "Cavallo 2", microchip: "380271000000002", ownerId: otherOwner!.id })
      .returning();

    await expectConstraintViolation(
      ctx.db
        .insert(entries)
        .values({ classId, horseId: horse2!.id, riderId, drawNumber: 1 }),
      "entries_class_draw_unique",
    );

    // senza draw (in attesa di sorteggio) l'iscrizione passa
    const ok = await ctx.db
      .insert(entries)
      .values({ classId, horseId: horse2!.id, riderId })
      .returning();
    expect(ok).toHaveLength(1);
  });

  it("il microchip deduplica i cavalli (modello identità)", async () => {
    await expectConstraintViolation(
      ctx.db
        .insert(horses)
        .values({ name: "Clone", microchip: "380271000000001", ownerId: riderId }),
      "horses_microchip_unique",
    );
  });

  it("l'email delle persone è unica senza distinzione di maiuscole", async () => {
    await ctx.db
      .insert(persons)
      .values({ fullName: "Mail Test", email: "Mail@Test.it" });
    await expectConstraintViolation(
      ctx.db
        .insert(persons)
        .values({ fullName: "Mail Doppia", email: "mail@test.it" }),
      "persons_email_unique",
    );
  });

  it("date evento incoerenti rifiutate", async () => {
    await expectConstraintViolation(
      ctx.db.insert(events).values({
        name: "Evento rotto",
        venue: "Ovunque",
        startDate: "2026-06-10",
        endDate: "2026-06-09",
      }),
      "events_dates_coherent",
    );
  });

  it("il catalogo è protetto: un pattern usato da una classe non si cancella", async () => {
    const [p6] = await ctx.db
      .select()
      .from(patterns)
      .where(eq(patterns.code, "6"));
    await expectConstraintViolation(
      ctx.db.delete(patterns).where(eq(patterns.id, p6!.id)),
      "classes_pattern_id_patterns_id_fk",
    );
  });
});
