import { and, eq, gt, sql } from "drizzle-orm";
import { createDb, type Db } from "../client.js";
import {
  categories,
  patternManeuvers,
  patterns,
} from "../schema/index.js";
import { loadCategories, loadPatterns } from "./reference.js";

// ---------------------------------------------------------------------------
// Seed idempotente del catalogo di dominio da reference/. Chiave di upsert:
// (code, season) — rilanciarlo non duplica e allinea i campi al file.
// ---------------------------------------------------------------------------

type EntryGait = (typeof patterns.$inferInsert)["entryGait"];
type ManeuverTypes = (typeof patternManeuvers.$inferInsert)["types"];
type Championship = (typeof categories.$inferInsert)["championship"];
type HorseOwnership = (typeof categories.$inferInsert)["horseOwnership"];

export async function seedCatalog(db: Db) {
  const patternsFile = loadPatterns();
  const categoriesFile = loadCategories();

  await db.transaction(async (tx) => {
    for (const p of patternsFile.patterns) {
      const patternValues = {
        code: p.code,
        season: patternsFile.season,
        name: p.name,
        entryGait: p.entry.gait as EntryGait,
        trotInMandatable: p.entry.trot_in_mandatable ?? false,
        entryStart: p.entry.start ?? null,
        entryNote: p.entry.note ?? null,
        restrictedTo: p.restricted_to ?? null,
      };
      const [row] = await tx
        .insert(patterns)
        .values(patternValues)
        .onConflictDoUpdate({
          target: [patterns.code, patterns.season],
          set: { ...patternValues, updatedAt: sql`now()` },
        })
        .returning({ id: patterns.id });
      if (!row) throw new Error(`Upsert fallito per il pattern ${p.code}`);

      for (const m of p.maneuvers) {
        const maneuverValues = {
          patternId: row.id,
          position: m.order,
          types: m.types as ManeuverTypes,
          labelIt: m.it,
        };
        await tx
          .insert(patternManeuvers)
          .values(maneuverValues)
          .onConflictDoUpdate({
            target: [patternManeuvers.patternId, patternManeuvers.position],
            set: { ...maneuverValues, updatedAt: sql`now()` },
          });
      }
      // Se una futura revisione del file accorcia un pattern, le posizioni
      // in coda non devono sopravvivere al seed.
      await tx
        .delete(patternManeuvers)
        .where(
          and(
            eq(patternManeuvers.patternId, row.id),
            gt(patternManeuvers.position, p.maneuvers.length),
          ),
        );
    }

    for (const c of categoriesFile.categories) {
      const categoryValues = {
        code: c.code,
        season: categoriesFile.season,
        name: c.name,
        championship: c.championship as Championship,
        fiseLicense: c.fise_license ?? null,
        membership: c.membership ?? null,
        tecnicoFederaleRequired: c.tecnico_federale_required ?? false,
        tecnicoNote: c.tecnico_note ?? null,
        horseOwnership: c.horse_ownership as HorseOwnership,
        horseNotes: c.horse_notes ?? null,
        riderAge: c.rider_age ?? null,
        earningsCap: c.earnings_cap ?? null,
        horseEarningsCap: c.horse_earnings_cap ?? null,
        nrhaFinal: c.nrha_final ?? null,
        restricted: c.restricted ?? null,
        notes: c.notes ?? null,
      };
      await tx
        .insert(categories)
        .values(categoryValues)
        .onConflictDoUpdate({
          target: [categories.code, categories.season],
          set: { ...categoryValues, updatedAt: sql`now()` },
        });
    }
  });

  return {
    season: patternsFile.season,
    patterns: patternsFile.patterns.length,
    maneuvers: patternsFile.patterns.reduce((n, p) => n + p.maneuvers.length, 0),
    categories: categoriesFile.categories.length,
  };
}

const invokedDirectly =
  process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (invokedDirectly) {
  const { db, pool } = createDb();
  seedCatalog(db)
    .then((s) => {
      console.log(
        `Seed stagione ${s.season}: ${s.patterns} pattern, ${s.maneuvers} manovre, ${s.categories} categorie.`,
      );
    })
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
