import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { schema } from "@penrunner/db";
import { publicProcedure, router } from "../trpc.js";

// ---------------------------------------------------------------------------
// Catalogo normativo (seed da reference/): le 24 categorie IRHA-FISE e i 20
// pattern della stagione. Dati pubblici e read-only — il wizard organizzatore
// li usa per creare le Class, la pagina pattern per i passi.
// ---------------------------------------------------------------------------

const DEFAULT_SEASON = 2026;

export const catalogRouter = router({
  categories: publicProcedure
    .input(z.object({ season: z.number().int().optional() }).optional())
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select({
          id: schema.categories.id,
          code: schema.categories.code,
          name: schema.categories.name,
          championship: schema.categories.championship,
          fiseLicense: schema.categories.fiseLicense,
          membership: schema.categories.membership,
          tecnicoFederaleRequired: schema.categories.tecnicoFederaleRequired,
          horseOwnership: schema.categories.horseOwnership,
          riderAge: schema.categories.riderAge,
          earningsCap: schema.categories.earningsCap,
          restricted: schema.categories.restricted,
          notes: schema.categories.notes,
        })
        .from(schema.categories)
        .where(eq(schema.categories.season, input?.season ?? DEFAULT_SEASON))
        .orderBy(asc(schema.categories.code));
    }),

  patterns: publicProcedure
    .input(z.object({ season: z.number().int().optional() }).optional())
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select({
          id: schema.patterns.id,
          code: schema.patterns.code,
          name: schema.patterns.name,
          entryGait: schema.patterns.entryGait,
          trotInMandatable: schema.patterns.trotInMandatable,
          restrictedTo: schema.patterns.restrictedTo,
          // Colonne qualificate a mano: dentro sql`` Drizzle non qualifica i
          // riferimenti e "id" risolverebbe sulla tabella interna.
          maneuversCount: sql<number>`(select count(*) from ${schema.patternManeuvers} pm where pm.pattern_id = ${schema.patterns}.id)::int`,
        })
        .from(schema.patterns)
        .where(eq(schema.patterns.season, input?.season ?? DEFAULT_SEASON))
        .orderBy(
          // "1"…"18" numerici prima, poi "A", "B".
          sql`case when ${schema.patterns.code} ~ '^[0-9]+$' then lpad(${schema.patterns.code}, 3, '0') else ${schema.patterns.code} end`,
        );
    }),
});
