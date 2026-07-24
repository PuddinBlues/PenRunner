import { TRPCError } from "@trpc/server";
import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { schema } from "@penrunner/db";
import { can } from "../policy/policy.js";
import { router, verifiedProcedure } from "../trpc.js";
import { loadEventOrganization } from "./org.js";

// ---------------------------------------------------------------------------
// CRUD delle classi dal wizard organizzatore. La classe lega evento, categoria
// (catalogo IRHA-FISE) e pattern (Patternbook); i valori normativi restano nel
// catalogo, qui vive solo la configurazione dello show. La preparazione non
// richiede il vetting (event.prepare): si impara facendo, in bozza (BR-80).
// ---------------------------------------------------------------------------

const moneyString = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, "Importo non valido (es. 120 o 120.50)");

async function requirePrepare(
  ctx: { db: Parameters<typeof loadEventOrganization>[0]; actor: Parameters<typeof can>[0] },
  eventId: string,
) {
  const event = await loadEventOrganization(ctx.db, eventId);
  if (!event) throw new TRPCError({ code: "NOT_FOUND" });
  if (
    !can(ctx.actor, "event.prepare", { organizationId: event.organizationId })
  ) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return event;
}

/**
 * Validazioni leggere dall'ART. 15 Reg. Disciplina Reining FISE/IRHA 2025:
 * avvisi in stile BR-18 — si vede, si decide, MAI si blocca.
 */
function art15Warnings(
  values: { entryFee?: string | undefined; trophyCost?: string | undefined },
  eventTier: string,
): Array<{ code: string; message: string }> {
  const warnings: Array<{ code: string; message: string }> = [];
  if (values.trophyCost !== undefined && Number(values.trophyCost) > 75) {
    warnings.push({
      code: "ART-15",
      message:
        "Costo trofei oltre 75 € IVA compresa: il regolamento consente di scalare dal montepremi al massimo 75 € (gare non-NRHA)",
    });
  }
  if (
    values.entryFee !== undefined &&
    eventTier === "regionale" &&
    Number(values.entryFee) > 30
  ) {
    warnings.push({
      code: "ART-15",
      message:
        "Quota classe oltre 30 €: tetto regolamentare d'iscrizione per le categorie regionali",
    });
  }
  return warnings;
}

export const classesRouter = router({
  create: verifiedProcedure
    .input(
      z.object({
        eventId: z.string().uuid(),
        categoryId: z.string().uuid(),
        patternId: z.string().uuid(),
        /** Default: il nome della categoria dal catalogo. */
        name: z.string().min(1).max(200).optional(),
        entryFee: moneyString.optional(),
        addedMoney: moneyString.optional(),
        trophyCost: moneyString.optional(),
        judgesCount: z.number().int().min(1).max(5).optional(),
        trotInImposed: z.boolean().optional(),
        maxEntries: z.number().int().min(1).nullable().optional(),
        scheduledOrder: z.number().int().min(1).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const event = await requirePrepare(ctx, input.eventId);
      const [category] = await ctx.db
        .select()
        .from(schema.categories)
        .where(eq(schema.categories.id, input.categoryId));
      if (!category) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Categoria non trovata nel catalogo",
        });
      }
      const [pattern] = await ctx.db
        .select()
        .from(schema.patterns)
        .where(eq(schema.patterns.id, input.patternId));
      if (!pattern) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Pattern non trovato nel catalogo",
        });
      }
      // BR-26: il trot-in si impone solo sui pattern walk-in che lo ammettono.
      if (input.trotInImposed && !pattern.trotInMandatable) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Il pattern ${pattern.code} non ammette il trot-in imposto`,
        });
      }
      const [created] = await ctx.db
        .insert(schema.classes)
        .values({
          eventId: input.eventId,
          categoryId: input.categoryId,
          patternId: input.patternId,
          name: input.name ?? category.name,
          ...(input.entryFee !== undefined ? { entryFee: input.entryFee } : {}),
          ...(input.addedMoney !== undefined
            ? { addedMoney: input.addedMoney }
            : {}),
          ...(input.trophyCost !== undefined
            ? { trophyCost: input.trophyCost }
            : {}),
          ...(input.judgesCount !== undefined
            ? { judgesCount: input.judgesCount }
            : {}),
          ...(input.trotInImposed !== undefined
            ? { trotInImposed: input.trotInImposed }
            : {}),
          ...(input.maxEntries !== undefined
            ? { maxEntries: input.maxEntries }
            : {}),
          ...(input.scheduledOrder !== undefined
            ? { scheduledOrder: input.scheduledOrder }
            : {}),
        })
        .returning();
      return {
        classId: created!.id,
        name: created!.name,
        // Avvisi ART. 15 (mai bloccanti): l'organizzatore vede e decide.
        warnings: art15Warnings(input, event.tier),
      };
    }),

  /** Le classi di un evento, con catalogo e conteggi (vista organizzatore). */
  listByEvent: verifiedProcedure
    .input(z.object({ eventId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await requirePrepare(ctx, input.eventId);
      return ctx.db
        .select({
          id: schema.classes.id,
          name: schema.classes.name,
          entryFee: schema.classes.entryFee,
          addedMoney: schema.classes.addedMoney,
          trophyCost: schema.classes.trophyCost,
          judgesCount: schema.classes.judgesCount,
          trotInImposed: schema.classes.trotInImposed,
          maxEntries: schema.classes.maxEntries,
          drawStatus: schema.classes.drawStatus,
          scheduledOrder: schema.classes.scheduledOrder,
          categoryId: schema.classes.categoryId,
          categoryCode: schema.categories.code,
          categoryName: schema.categories.name,
          patternId: schema.classes.patternId,
          patternCode: schema.patterns.code,
          patternName: schema.patterns.name,
          // Qualificazione a mano: dentro sql`` Drizzle non qualifica le colonne.
          entriesCount: sql<number>`(select count(*) from ${schema.entries} e where e.class_id = ${schema.classes}.id and e.status <> 'bozza')::int`,
        })
        .from(schema.classes)
        .innerJoin(
          schema.categories,
          eq(schema.categories.id, schema.classes.categoryId),
        )
        .innerJoin(
          schema.patterns,
          eq(schema.patterns.id, schema.classes.patternId),
        )
        .where(eq(schema.classes.eventId, input.eventId))
        .orderBy(
          sql`${schema.classes.scheduledOrder} nulls last`,
          asc(schema.classes.createdAt),
        );
    }),

  update: verifiedProcedure
    .input(
      z.object({
        classId: z.string().uuid(),
        name: z.string().min(1).max(200).optional(),
        patternId: z.string().uuid().optional(),
        entryFee: moneyString.optional(),
        addedMoney: moneyString.optional(),
        trophyCost: moneyString.optional(),
        judgesCount: z.number().int().min(1).max(5).optional(),
        trotInImposed: z.boolean().optional(),
        maxEntries: z.number().int().min(1).nullable().optional(),
        scheduledOrder: z.number().int().min(1).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [cls] = await ctx.db
        .select()
        .from(schema.classes)
        .where(eq(schema.classes.id, input.classId));
      if (!cls) throw new TRPCError({ code: "NOT_FOUND" });
      const event = await requirePrepare(ctx, cls.eventId);

      // A draw pubblicato la struttura sportiva è congelata: pattern e numero
      // giudici non si toccano (le carte in arena ne dipendono). I campi
      // economici restano modificabili: il payout è derivato e si ricalcola.
      const drawn = cls.drawStatus === "pubblicato";
      if (drawn && (input.patternId !== undefined || input.judgesCount !== undefined)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Draw pubblicato: pattern e numero giudici non sono più modificabili",
        });
      }
      if (input.patternId !== undefined || input.trotInImposed) {
        const patternId = input.patternId ?? cls.patternId;
        const [pattern] = await ctx.db
          .select()
          .from(schema.patterns)
          .where(eq(schema.patterns.id, patternId));
        if (!pattern) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Pattern non trovato nel catalogo",
          });
        }
        const trotIn = input.trotInImposed ?? cls.trotInImposed;
        if (trotIn && !pattern.trotInMandatable) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Il pattern ${pattern.code} non ammette il trot-in imposto`,
          });
        }
      }
      const { classId: _ignored, ...fields } = input;
      const changes = Object.fromEntries(
        Object.entries(fields).filter(([, v]) => v !== undefined),
      );
      if (Object.keys(changes).length === 0)
        return { updated: false, warnings: [] };
      await ctx.db
        .update(schema.classes)
        .set(changes)
        .where(eq(schema.classes.id, input.classId));
      return { updated: true, warnings: art15Warnings(input, event.tier) };
    }),

  /**
   * Rimozione: solo una classe ancora "vuota" (nessun draw, nessuna
   * iscrizione). L'annullamento di una classe con iscrizioni o draw — con
   * gestione di rimborsi e cascata — è lavoro noto rimandato, non un buco:
   * il messaggio lo dichiara.
   */
  remove: verifiedProcedure
    .input(z.object({ classId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [cls] = await ctx.db
        .select()
        .from(schema.classes)
        .where(eq(schema.classes.id, input.classId));
      if (!cls) throw new TRPCError({ code: "NOT_FOUND" });
      await requirePrepare(ctx, cls.eventId);
      if (cls.drawStatus !== "nessuno") {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "La classe ha già un draw: l'annullamento di una classe avviata sarà supportato in una versione futura (per ora contatta PenRunner)",
        });
      }
      const [count] = await ctx.db
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.entries)
        .where(eq(schema.entries.classId, input.classId));
      if ((count?.n ?? 0) > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "La classe ha iscrizioni: l'annullamento con gestione dei rimborsi sarà supportato in una versione futura (per ora contatta PenRunner)",
        });
      }
      await ctx.db
        .delete(schema.classes)
        .where(eq(schema.classes.id, input.classId));
      return { removed: true };
    }),
});
