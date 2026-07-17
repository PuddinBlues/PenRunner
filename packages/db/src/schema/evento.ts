import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  integer,
  numeric,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./accounts.js";
import { baseColumns } from "./base.js";
import { categories, patterns } from "./catalog.js";
import { eventStatus, eventTier } from "./enums.js";

// ---------------------------------------------------------------------------
// Evento e sue articolazioni. Classifica, payout, fee maturata ed ETA sono
// viste derivate (BR-30, BR-50): qui vivono solo i dati di configurazione da
// cui si calcolano.
// ---------------------------------------------------------------------------

export const events = pgTable(
  "events",
  {
    ...baseColumns,
    // L'evento appartiene al club organizzatore; crearlo richiede
    // un'organizzazione con vetting superato (policy, non CHECK).
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    venue: text("venue").notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    tier: eventTier("tier").notNull().default("regionale"),
    themePrimary: text("theme_primary"),
    themeSecondary: text("theme_secondary"),
    heroImage: text("hero_image"),
    feePerHorse: numeric("fee_per_horse", { precision: 8, scale: 2 })
      .notNull()
      .default("15"), // BR-02
    status: eventStatus("status").notNull().default("bozza"),
    // Calibrazione ETA (BR-51): i default riproducono "≈10 cavalli/ora".
    slotDurationS: integer("slot_duration_s").notNull().default(270),
    dragEveryNRuns: integer("drag_every_n_runs").notNull().default(5),
    dragDurationS: integer("drag_duration_s").notNull().default(420),
    selfScratchEnabled: boolean("self_scratch_enabled").notNull().default(true), // BR-17
  },
  (t) => [
    check("events_dates_coherent", sql`${t.endDate} >= ${t.startDate}`),
    check("events_fee_non_negative", sql`${t.feePerHorse} >= 0`),
    check(
      "events_eta_positive",
      sql`${t.slotDurationS} > 0 and ${t.dragEveryNRuns} > 0 and ${t.dragDurationS} >= 0`,
    ),
  ],
);

export const classes = pgTable(
  "classes",
  {
    ...baseColumns,
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    // Default dal catalogo, personalizzabile (es. "Open L4 · Derby").
    name: text("name").notNull(),
    patternId: uuid("pattern_id")
      .notNull()
      .references(() => patterns.id, { onDelete: "restrict" }),
    entryFee: numeric("entry_fee", { precision: 8, scale: 2 })
      .notNull()
      .default("0"),
    addedMoney: numeric("added_money", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    judgesCount: integer("judges_count").notNull().default(1),
    // BR-26: scelta dello show (va pubblicata), non del catalogo pattern.
    trotInImposed: boolean("trot_in_imposed").notNull().default(false),
  },
  (t) => [
    check("classes_judges_min", sql`${t.judgesCount} >= 1`),
    check(
      "classes_money_non_negative",
      sql`${t.entryFee} >= 0 and ${t.addedMoney} >= 0`,
    ),
  ],
);
