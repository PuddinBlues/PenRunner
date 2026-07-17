import { sql } from "drizzle-orm";
import {
  check,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { horses, persons } from "./anagrafiche.js";
import { baseColumns } from "./base.js";
import { patternManeuvers } from "./catalog.js";
import { classes } from "./evento.js";
import {
  entryStatus,
  runStatus,
  scoreCardSpecial,
  scoreCardStatus,
} from "./enums.js";

// ---------------------------------------------------------------------------
// Iscrizione e svolgimento. Per costruzione NON esistono colonne per lo score
// di carta, il final_score della run, la classifica o il payout: sono tutti
// derivati dagli input (BR-20, BR-24, BR-30). Alla firma il totale si mostra,
// non si salva: la firma congela gli input.
// ---------------------------------------------------------------------------

export const entries = pgTable(
  "entries",
  {
    ...baseColumns,
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    horseId: uuid("horse_id")
      .notNull()
      .references(() => horses.id, { onDelete: "restrict" }),
    riderId: uuid("rider_id")
      .notNull()
      .references(() => persons.id, { onDelete: "restrict" }),
    drawNumber: integer("draw_number"),
    status: entryStatus("status").notNull().default("bozza"),
    // BR-16: tecnico federale indicato all'iscrizione dove la categoria lo
    // richiede; l'assenza produce un avviso, mai un blocco (BR-18).
    tecnicoName: text("tecnico_name"),
    // BR-18: snapshot degli avvisi di eleggibilità alla conferma — traccia
    // che resta sull'iscrizione anche dopo check-in e partenza, non censura.
    eligibilityWarnings: jsonb("eligibility_warnings"),
  },
  (t) => [
    // BR-11: lo stesso cavallo non si iscrive due volte alla stessa classe.
    unique("entries_class_horse").on(t.classId, t.horseId),
    // Il draw può avere buchi (scratch), mai doppioni.
    uniqueIndex("entries_class_draw_unique")
      .on(t.classId, t.drawNumber)
      .where(sql`${t.drawNumber} is not null`),
    check(
      "entries_draw_min",
      sql`${t.drawNumber} is null or ${t.drawNumber} >= 1`,
    ),
  ],
);

export const runs = pgTable(
  "runs",
  {
    ...baseColumns,
    entryId: uuid("entry_id")
      .notNull()
      .references(() => entries.id, { onDelete: "cascade" }),
    goRound: integer("go_round").notNull().default(1), // 1, 2, finale…
    status: runStatus("status").notNull().default("attesa"),
  },
  (t) => [
    unique("runs_entry_go_round").on(t.entryId, t.goRound),
    check("runs_go_round_min", sql`${t.goRound} >= 1`),
  ],
);

export const scoreCards = pgTable(
  "score_cards",
  {
    ...baseColumns,
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    judgeId: uuid("judge_id")
      .notNull()
      .references(() => persons.id, { onDelete: "restrict" }),
    // Penalità dell'intera prova, separata da quelle di manovra (BR-22).
    runPenalty: numeric("run_penalty", { precision: 4, scale: 1 })
      .notNull()
      .default("0"),
    special: scoreCardSpecial("special"), // BR-23
    status: scoreCardStatus("status").notNull().default("in_compilazione"),
    signedAt: timestamp("signed_at", { withTimezone: true }),
  },
  (t) => [
    unique("score_cards_run_judge").on(t.runId, t.judgeId),
    check("score_cards_run_penalty_non_negative", sql`${t.runPenalty} >= 0`),
    // Dalla firma in poi la carta ha sempre un timestamp di firma (BR-40).
    check(
      "score_cards_signed_has_timestamp",
      sql`${t.status} = 'in_compilazione' or ${t.signedAt} is not null`,
    ),
  ],
);

export const maneuverScores = pgTable(
  "maneuver_scores",
  {
    ...baseColumns,
    scoreCardId: uuid("score_card_id")
      .notNull()
      .references(() => scoreCards.id, { onDelete: "cascade" }),
    maneuverId: uuid("maneuver_id")
      .notNull()
      .references(() => patternManeuvers.id, { onDelete: "restrict" }),
    quality: numeric("quality", { precision: 2, scale: 1 })
      .notNull()
      .default("0"),
    // Totale già sommato dallo scribe: nessun catalogo per tipo (BR-22).
    penalty: numeric("penalty", { precision: 4, scale: 1 })
      .notNull()
      .default("0"),
  },
  (t) => [
    unique("maneuver_scores_card_maneuver").on(t.scoreCardId, t.maneuverId),
    // BR-21: qualità in [−1.5, +1.5] a passi di 0.5.
    check(
      "maneuver_scores_quality_range",
      sql`${t.quality} between -1.5 and 1.5 and mod(${t.quality} * 2, 1) = 0`,
    ),
    check("maneuver_scores_penalty_non_negative", sql`${t.penalty} >= 0`),
  ],
);
