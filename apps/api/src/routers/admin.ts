import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { schema } from "@penrunner/db";
import { recordAudit } from "../services/audit.js";
import { revokeAllUserSessions } from "../services/sessions.js";
import { adminProcedure, router } from "../trpc.js";

// ---------------------------------------------------------------------------
// Back-office Platform Admin (BR-70). Nessun potere silenzioso: ogni azione
// scrive nell'audit log immutabile (BR-71). Merge identità (BR-72) ed
// export/cancellazione GDPR (BR-73) sono pianificati in uno step di
// back-office successivo, prima del lancio.
// ---------------------------------------------------------------------------

export const adminRouter = router({
  vettingQueue: adminProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.vettingStatus, "in_verifica"))
      .orderBy(schema.organizations.createdAt);
  }),

  approveOrganization: adminProcedure
    .input(z.object({ organizationId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const actorUserId = ctx.actor.userId;
      await ctx.db.transaction(async (tx) => {
        const [before] = await tx
          .select()
          .from(schema.organizations)
          .where(eq(schema.organizations.id, input.organizationId));
        if (!before) throw new TRPCError({ code: "NOT_FOUND" });
        const [after] = await tx
          .update(schema.organizations)
          .set({
            vettingStatus: "verificata",
            vettingNote: null,
            verifiedAt: new Date(),
            verifiedBy: actorUserId,
          })
          .where(eq(schema.organizations.id, input.organizationId))
          .returning();
        await recordAudit(tx, {
          actorUserId,
          action: "organization.vetting.approve",
          entityType: "organization",
          entityId: input.organizationId,
          before: { vettingStatus: before.vettingStatus },
          after: { vettingStatus: after!.vettingStatus },
        });
      });
      return { vettingStatus: "verificata" as const };
    }),

  rejectOrganization: adminProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        // Il rifiuto è sempre motivato (spec: respinta con motivazione).
        note: z.string().min(1).max(2000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const actorUserId = ctx.actor.userId;
      await ctx.db.transaction(async (tx) => {
        const [before] = await tx
          .select()
          .from(schema.organizations)
          .where(eq(schema.organizations.id, input.organizationId));
        if (!before) throw new TRPCError({ code: "NOT_FOUND" });
        const [after] = await tx
          .update(schema.organizations)
          .set({ vettingStatus: "respinta", vettingNote: input.note })
          .where(eq(schema.organizations.id, input.organizationId))
          .returning();
        await recordAudit(tx, {
          actorUserId,
          action: "organization.vetting.reject",
          entityType: "organization",
          entityId: input.organizationId,
          before: { vettingStatus: before.vettingStatus },
          after: { vettingStatus: after!.vettingStatus },
          note: input.note,
        });
      });
      return { vettingStatus: "respinta" as const };
    }),

  suspendUser: adminProcedure
    .input(
      z.object({
        userId: z.string().uuid(),
        reason: z.string().min(1).max(2000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const actorUserId = ctx.actor.userId;
      await ctx.db.transaction(async (tx) => {
        const [before] = await tx
          .select()
          .from(schema.users)
          .where(eq(schema.users.id, input.userId));
        if (!before) throw new TRPCError({ code: "NOT_FOUND" });
        await tx
          .update(schema.users)
          .set({ suspendedAt: new Date(), suspendedReason: input.reason })
          .where(eq(schema.users.id, input.userId));
        await recordAudit(tx, {
          actorUserId,
          action: "user.suspend",
          entityType: "user",
          entityId: input.userId,
          before: { suspendedAt: before.suspendedAt },
          after: { suspendedAt: new Date().toISOString() },
          note: input.reason,
        });
      });
      // La sospensione taglia subito ogni sessione attiva.
      await revokeAllUserSessions(ctx.db, input.userId);
      return { suspended: true };
    }),

  unsuspendUser: adminProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const actorUserId = ctx.actor.userId;
      await ctx.db.transaction(async (tx) => {
        const [before] = await tx
          .select()
          .from(schema.users)
          .where(eq(schema.users.id, input.userId));
        if (!before) throw new TRPCError({ code: "NOT_FOUND" });
        await tx
          .update(schema.users)
          .set({ suspendedAt: null, suspendedReason: null })
          .where(eq(schema.users.id, input.userId));
        await recordAudit(tx, {
          actorUserId,
          action: "user.unsuspend",
          entityType: "user",
          entityId: input.userId,
          before: { suspendedAt: before.suspendedAt },
          after: { suspendedAt: null },
        });
      });
      return { suspended: false };
    }),

  // BR-02: la quota PenRunner è una leva commerciale — solo lo staff la
  // imposta (mai l'organizzatore), e ogni modifica lascia audit (BR-71).
  setOrganizationPlatformFee: adminProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        platformFeePerHorse: z.number().min(0).max(1000),
        note: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const actorUserId = ctx.actor.userId;
      await ctx.db.transaction(async (tx) => {
        const [before] = await tx
          .select()
          .from(schema.organizations)
          .where(eq(schema.organizations.id, input.organizationId));
        if (!before) throw new TRPCError({ code: "NOT_FOUND" });
        await tx
          .update(schema.organizations)
          .set({ platformFeePerHorse: input.platformFeePerHorse.toFixed(2) })
          .where(eq(schema.organizations.id, input.organizationId));
        await recordAudit(tx, {
          actorUserId,
          action: "organization.platform_fee.set",
          entityType: "organization",
          entityId: input.organizationId,
          before: { platformFeePerHorse: before.platformFeePerHorse },
          after: { platformFeePerHorse: input.platformFeePerHorse.toFixed(2) },
          ...(input.note ? { note: input.note } : {}),
        });
      });
      return { platformFeePerHorse: input.platformFeePerHorse };
    }),

  setEventPlatformFee: adminProcedure
    .input(
      z.object({
        eventId: z.string().uuid(),
        // null = rimuove l'override, torna la quota dell'organizzazione
        platformFeePerHorse: z.number().min(0).max(1000).nullable(),
        note: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const actorUserId = ctx.actor.userId;
      await ctx.db.transaction(async (tx) => {
        const [before] = await tx
          .select()
          .from(schema.events)
          .where(eq(schema.events.id, input.eventId));
        if (!before) throw new TRPCError({ code: "NOT_FOUND" });
        const next =
          input.platformFeePerHorse === null
            ? null
            : input.platformFeePerHorse.toFixed(2);
        await tx
          .update(schema.events)
          .set({ platformFeePerHorse: next })
          .where(eq(schema.events.id, input.eventId));
        await recordAudit(tx, {
          actorUserId,
          action: "event.platform_fee.set",
          entityType: "event",
          entityId: input.eventId,
          before: { platformFeePerHorse: before.platformFeePerHorse },
          after: { platformFeePerHorse: next },
          ...(input.note ? { note: input.note } : {}),
        });
      });
      return { platformFeePerHorse: input.platformFeePerHorse };
    }),

  // BR-43: la chirurgia del draw è una capacità concessa per evento — solo
  // lo staff la attiva/revoca, sempre in audit (come la platform fee).
  setDrawSurgery: adminProcedure
    .input(
      z.object({
        eventId: z.string().uuid(),
        enabled: z.boolean(),
        note: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const actorUserId = ctx.actor.userId;
      await ctx.db.transaction(async (tx) => {
        const [before] = await tx
          .select()
          .from(schema.events)
          .where(eq(schema.events.id, input.eventId));
        if (!before) throw new TRPCError({ code: "NOT_FOUND" });
        await tx
          .update(schema.events)
          .set({ drawSurgeryEnabled: input.enabled })
          .where(eq(schema.events.id, input.eventId));
        await recordAudit(tx, {
          actorUserId,
          action: "event.draw_surgery.set",
          entityType: "event",
          entityId: input.eventId,
          before: { drawSurgeryEnabled: before.drawSurgeryEnabled },
          after: { drawSurgeryEnabled: input.enabled },
          ...(input.note ? { note: input.note } : {}),
        });
      });
      return { drawSurgeryEnabled: input.enabled };
    }),

  auditLog: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(200).default(50) }))
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select()
        .from(schema.auditLog)
        .orderBy(desc(schema.auditLog.occurredAt))
        .limit(input.limit);
    }),
});
