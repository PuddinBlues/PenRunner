import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  jsonb,
  pgTable,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { baseColumns } from "./base.js";
import { championship, entryGait, horseOwnership, maneuverType } from "./enums.js";

// ---------------------------------------------------------------------------
// Catalogo di dominio: dati normativi versionati per stagione, condivisi tra
// eventi. Seed da reference/patterns.json e reference/categories.json — mai
// inventare o modificare a mano i valori normativi.
// ---------------------------------------------------------------------------

export const patterns = pgTable(
  "patterns",
  {
    ...baseColumns,
    code: text("code").notNull(), // "1"…"18", "A", "B"
    season: integer("season").notNull(),
    name: text("name").notNull(),
    entryGait: entryGait("entry_gait").notNull(),
    // Se walk_in, lo show management può imporre il trot-in (BR-26).
    trotInMandatable: boolean("trot_in_mandatable").notNull().default(false),
    entryStart: text("entry_start"), // es. "centro, rivolti al lato sinistro"
    entryNote: text("entry_note"),
    restrictedTo: text("restricted_to").array(), // A e B: Youth 10&Under / Short Stirrup
  },
  (t) => [unique("patterns_code_season").on(t.code, t.season)],
);

// I passi del patternbook: coincidono 1:1 con le colonne manovra della score
// card ufficiale (verificato su una card reale del Pattern 6).
export const patternManeuvers = pgTable(
  "pattern_maneuvers",
  {
    ...baseColumns,
    patternId: uuid("pattern_id")
      .notNull()
      .references(() => patterns.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    types: maneuverType("types").array().notNull(),
    labelIt: text("label_it").notNull(),
    labelEn: text("label_en"), // arriverà dall'Handbook NRHA come campo "en"
  },
  (t) => [
    unique("pattern_maneuvers_pattern_position").on(t.patternId, t.position),
    check("pattern_maneuvers_position_min", sql`${t.position} >= 1`),
    check(
      "pattern_maneuvers_types_not_empty",
      sql`cardinality(${t.types}) >= 1`,
    ),
  ],
);

// Le 24 categorie ufficiali IRHA-FISE: l'eleggibilità (BR-10, BR-13..16) si
// valuta contro questo catalogo. I vincoli semi-strutturati (età, tetti di
// vincite) restano jsonb finché il motore di eleggibilità non li reclama.
export const categories = pgTable(
  "categories",
  {
    ...baseColumns,
    code: text("code").notNull(), // es. "101", "113 NA"
    season: integer("season").notNull(),
    name: text("name").notNull(),
    championship: championship("championship").notNull(),
    fiseLicense: text("fise_license"),
    membership: text("membership"),
    tecnicoFederaleRequired: boolean("tecnico_federale_required")
      .notNull()
      .default(false), // BR-16
    tecnicoNote: text("tecnico_note"),
    horseOwnership: horseOwnership("horse_ownership").notNull(), // BR-14
    horseNotes: text("horse_notes"),
    riderAge: jsonb("rider_age"), // BR-15: { min?, max?, rule }
    earningsCap: jsonb("earnings_cap"), // BR-13: { amount, currency, scope, ref }
    horseEarningsCap: jsonb("horse_earnings_cap"),
    nrhaFinal: boolean("nrha_final"),
    restricted: text("restricted"), // es. "Riservata a sole donne"
    notes: text("notes"),
  },
  (t) => [unique("categories_code_season").on(t.code, t.season)],
);
