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
