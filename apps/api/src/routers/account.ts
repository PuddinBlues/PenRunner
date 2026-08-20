import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { schema, type Db } from "@penrunner/db";
import { personDisplayNameSql } from "../services/names.js";
import { can } from "../policy/policy.js";
import { router, verifiedProcedure } from "../trpc.js";
import { quoteForEntries } from "./entries.js";

// ---------------------------------------------------------------------------
// BR-89: il conto scuderia. Vista SEMPRE derivata — zero totali memorizzati,
// il prezzo esce dalla STESSA funzione del checkout (quoteForEntries). Il
// conto è della scuderia del CAVALLO (la fee è per cavallo: paga chi lo
// porta); lo storico viene dalle transizioni auditate (entry.confirm,
// entry.scratch, draw.late_entry.add) — append-only, mai riscritto.
// Contano le iscrizioni da "confermata" in poi: la fee matura alla conferma
// ed è dovuta anche dopo il ritiro (BR-03/BR-17). Le bozze non sono conto.
// ---------------------------------------------------------------------------

type DbOrTx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

const ACCOUNT_AUDIT_ACTIONS = [
  "entry.confirm",
  "entry.scratch",
  "draw.late_entry.add",
] as const;

/** Le righe-movimento del conto: iscrizioni non-bozza dei cavalli della scuderia. */
async function accountRows(db: DbOrTx, eventId: string, stableId: string) {
  return db
    .select({
      entryId: schema.entries.id,
      status: schema.entries.status,
      horseId: schema.entries.horseId,
      horseName: schema.horses.name,
      riderName: personDisplayNameSql,
      className: schema.classes.name,
      entryFee: schema.classes.entryFee,
    })
    .from(schema.entries)
    .innerJoin(schema.classes, eq(schema.classes.id, schema.entries.classId))
    .innerJoin(schema.horses, eq(schema.horses.id, schema.entries.horseId))
    .innerJoin(schema.persons, eq(schema.persons.id, schema.entries.riderId))
    .where(
      and(
        eq(schema.classes.eventId, eventId),
        eq(schema.horses.stableId, stableId),
        ne(schema.entries.status, "bozza"),
      ),
    )
    .orderBy(schema.classes.name, schema.horses.name);
}

/** Il conto di UNA scuderia per UN evento, con storico dai movimenti auditati. */
async function buildStableAccount(db: DbOrTx, eventId: string, stableId: string) {
  const rows = await accountRows(db, eventId, stableId);
  const quote = await quoteForEntries(
    db,
    rows.map((r) => r.entryId),
  );
  const history =
    rows.length === 0
      ? []
      : await db
          .select({
            occurredAt: schema.auditLog.occurredAt,
            action: schema.auditLog.action,
            entityId: schema.auditLog.entityId,
          })
          .from(schema.auditLog)
          .where(
            and(
              eq(schema.auditLog.entityType, "entry"),
              inArray(
                schema.auditLog.entityId,
                rows.map((r) => r.entryId),
              ),
              inArray(schema.auditLog.action, [...ACCOUNT_AUDIT_ACTIONS]),
            ),
          )
          .orderBy(asc(schema.auditLog.occurredAt));
  const byEntry = new Map(rows.map((r) => [r.entryId, r]));
  return {
    rows,
    quote,
    history: history.map((h) => ({
      occurredAt: h.occurredAt,
      action: h.action,
      horseName: h.entityId ? (byEntry.get(h.entityId)?.horseName ?? null) : null,
      className: h.entityId ? (byEntry.get(h.entityId)?.className ?? null) : null,
    })),
  };
}

export const accountRouter = router({
  /**
   * Lato scuderia: il conto per ogni evento in cui i suoi cavalli hanno
   * iscrizioni maturate. Sostituisce l'Excel che oggi cambia 5 volte a
   * iscrizione: sempre giusto perché sempre ricalcolato.
   */
  byStable: verifiedProcedure
    .input(z.object({ stableId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!can(ctx.actor, "entries.bulk", { stableId: input.stableId })) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const events = await ctx.db
        .selectDistinct({
          eventId: schema.events.id,
          eventName: schema.events.name,
          startDate: schema.events.startDate,
          feePerHorse: schema.events.feePerHorse,
        })
        .from(schema.entries)
        .innerJoin(schema.classes, eq(schema.classes.id, schema.entries.classId))
        .innerJoin(schema.events, eq(schema.events.id, schema.classes.eventId))
        .innerJoin(schema.horses, eq(schema.horses.id, schema.entries.horseId))
        .where(
          and(
            eq(schema.horses.stableId, input.stableId),
            ne(schema.entries.status, "bozza"),
          ),
        );
      return Promise.all(
        events.map(async (ev) => ({
          ...ev,
          ...(await buildStableAccount(ctx.db, ev.eventId, input.stableId)),
        })),
      );
    }),

  /**
   * Lato regia: "Conti scuderie" — per ogni scuderia con cavalli iscritti
   * all'evento, il totale derivato (stessa funzione di pricing). Essenziale:
   * la segreteria incassa al check-in, qui vede quanto e da chi.
   */
  byEvent: verifiedProcedure
    .input(z.object({ eventId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [event] = await ctx.db
        .select()
        .from(schema.events)
        .where(eq(schema.events.id, input.eventId));
      if (!event) throw new TRPCError({ code: "NOT_FOUND" });
      if (
        !can(ctx.actor, "event.registry.manage", {
          organizationId: event.organizationId,
          eventId: event.id,
        })
      ) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const stables = await ctx.db
        .selectDistinct({
          stableId: schema.horses.stableId,
          stableName: schema.stables.name,
        })
        .from(schema.entries)
        .innerJoin(schema.classes, eq(schema.classes.id, schema.entries.classId))
        .innerJoin(schema.horses, eq(schema.horses.id, schema.entries.horseId))
        .innerJoin(schema.stables, eq(schema.stables.id, schema.horses.stableId))
        .where(
          and(
            eq(schema.classes.eventId, input.eventId),
            ne(schema.entries.status, "bozza"),
          ),
        )
        .orderBy(schema.stables.name);
      return Promise.all(
        stables
          .filter((s): s is { stableId: string; stableName: string } => s.stableId !== null)
          .map(async (s) => {
            const { rows, quote } = await buildStableAccount(
              ctx.db,
              input.eventId,
              s.stableId,
            );
            return {
              stableId: s.stableId,
              stableName: s.stableName,
              enrollments: quote.enrollments,
              horses: quote.horses,
              classesCost: quote.classesCost,
              fee: quote.fee,
              total: quote.total,
              scratched: rows.filter((r) => r.status === "ritirata").length,
            };
          }),
      );
    }),
});

export { buildStableAccount };
