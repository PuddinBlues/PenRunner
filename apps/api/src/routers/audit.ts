import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { z } from "zod";
import { schema } from "@penrunner/db";
import { can } from "../policy/policy.js";
import { router, verifiedProcedure } from "../trpc.js";
import { loadEventOrganization } from "./org.js";

// ---------------------------------------------------------------------------
// Vista audit event-scoped per l'organizzatore: read-only, solo le righe che
// riguardano il SUO evento (evento, classi, iscrizioni, score card). La coda
// cross-tenant resta admin.auditLog (BR-70/71); qui è trasparenza, non potere.
// ---------------------------------------------------------------------------

export const auditRouter = router({
  forEvent: verifiedProcedure
    .input(
      z.object({
        eventId: z.string().uuid(),
        limit: z.number().int().min(1).max(500).default(100),
      }),
    )
    .query(async ({ ctx, input }) => {
      const event = await loadEventOrganization(ctx.db, input.eventId);
      if (!event) throw new TRPCError({ code: "NOT_FOUND" });
      if (
        !can(ctx.actor, "event.prepare", {
          organizationId: event.organizationId,
        })
      ) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      // Perimetro: gli id appartenenti all'evento, per tipo di entità.
      const classIds = ctx.db
        .select({ id: schema.classes.id })
        .from(schema.classes)
        .where(eq(schema.classes.eventId, input.eventId));
      const entryIds = ctx.db
        .select({ id: schema.entries.id })
        .from(schema.entries)
        .where(inArray(schema.entries.classId, classIds));
      const cardIds = ctx.db
        .select({ id: schema.scoreCards.id })
        .from(schema.scoreCards)
        .innerJoin(schema.runs, eq(schema.runs.id, schema.scoreCards.runId))
        .where(inArray(schema.runs.entryId, entryIds));

      const rows = await ctx.db
        .select({
          id: schema.auditLog.id,
          occurredAt: schema.auditLog.occurredAt,
          action: schema.auditLog.action,
          entityType: schema.auditLog.entityType,
          entityId: schema.auditLog.entityId,
          before: schema.auditLog.before,
          after: schema.auditLog.after,
          note: schema.auditLog.note,
          actorEmail: schema.users.email,
        })
        .from(schema.auditLog)
        .leftJoin(schema.users, eq(schema.users.id, schema.auditLog.actorUserId))
        .where(
          or(
            and(
              eq(schema.auditLog.entityType, "event"),
              eq(schema.auditLog.entityId, input.eventId),
            ),
            and(
              eq(schema.auditLog.entityType, "class"),
              inArray(schema.auditLog.entityId, classIds),
            ),
            and(
              eq(schema.auditLog.entityType, "entry"),
              inArray(schema.auditLog.entityId, entryIds),
            ),
            and(
              eq(schema.auditLog.entityType, "score_card"),
              inArray(schema.auditLog.entityId, cardIds),
            ),
          ),
        )
        .orderBy(desc(schema.auditLog.occurredAt))
        .limit(input.limit);

      // Le note della quota PenRunner sono tra staff e non riguardano la
      // trasparenza di gara: all'organizzatore la riga sì, la nota no.
      return rows.map((r) =>
        r.action === "event.platform_fee.set" ? { ...r, note: null } : r,
      );
    }),
});
