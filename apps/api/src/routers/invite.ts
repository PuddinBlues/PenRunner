import { TRPCError } from "@trpc/server";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { schema } from "@penrunner/db";
import { can } from "../policy/policy.js";
import { generateToken, hashToken } from "../services/crypto.js";
import { createInviteSession } from "../services/sessions.js";
import { publicProcedure, router, verifiedProcedure } from "../trpc.js";
import { loadEventOrganization } from "./org.js";

const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Inviti event-scoped per giudice/scribe/segreteria: niente account pieno.
// L'assegnazione si disattiva, non si cancella (le carte firmate referenziano
// persons e sopravvivono alla sostituzione). L'accettazione apre una sessione
// scoped che vale solo per l'evento e il ruolo dell'assegnazione.
// ---------------------------------------------------------------------------

export const inviteRouter = router({
  create: verifiedProcedure
    .input(
      z.object({
        eventId: z.string().uuid(),
        role: z.enum(["giudice", "scribe", "segreteria"]),
        classId: z.string().uuid().optional(),
        person: z.union([
          z.object({ personId: z.string().uuid() }),
          z.object({
            fullName: z.string().min(1).max(200),
            email: z.string().email(),
          }),
        ]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const event = await loadEventOrganization(ctx.db, input.eventId);
      if (!event) throw new TRPCError({ code: "NOT_FOUND" });
      if (
        !can(ctx.actor, "event.configure", {
          organizationId: event.organizationId,
        })
      ) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const token = generateToken();
      const result = await ctx.db.transaction(async (tx) => {
        // Modello identità: si collega la person esistente, non si duplica.
        let personId: string;
        let email: string | null = null;
        if ("personId" in input.person) {
          const [person] = await tx
            .select()
            .from(schema.persons)
            .where(eq(schema.persons.id, input.person.personId));
          if (!person) throw new TRPCError({ code: "NOT_FOUND" });
          personId = person.id;
          email = person.email;
        } else {
          const normalized = input.person.email.toLowerCase();
          const [existing] = await tx
            .select()
            .from(schema.persons)
            .where(sql`lower(${schema.persons.email}) = ${normalized}`);
          if (existing) {
            personId = existing.id;
          } else {
            const [created] = await tx
              .insert(schema.persons)
              .values({
                fullName: input.person.fullName,
                email: normalized,
              })
              .returning();
            personId = created!.id;
          }
          email = normalized;
        }

        const [assignment] = await tx
          .insert(schema.eventRoleAssignments)
          .values({
            eventId: input.eventId,
            personId,
            role: input.role,
            classId: input.classId ?? null,
          })
          .returning();

        const [invite] = await tx
          .insert(schema.eventInvites)
          .values({
            assignmentId: assignment!.id,
            email,
            tokenHash: hashToken(token),
            expiresAt: new Date(Date.now() + INVITE_TTL_MS),
          })
          .returning();
        return { assignmentId: assignment!.id, inviteId: invite!.id, email };
      });

      if (result.email) {
        await ctx.mailer.send({
          to: result.email,
          subject: `Sei stato assegnato come ${input.role}`,
          body: `Entra nell'evento con questo token: ${token}`,
        });
      }
      return { assignmentId: result.assignmentId, inviteId: result.inviteId };
    }),

  /** Magic link: apre una sessione scoped, nessun account creato. */
  accept: publicProcedure
    .input(z.object({ token: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const now = new Date();
      const [row] = await ctx.db
        .select({
          invite: schema.eventInvites,
          assignment: schema.eventRoleAssignments,
        })
        .from(schema.eventInvites)
        .innerJoin(
          schema.eventRoleAssignments,
          eq(schema.eventRoleAssignments.id, schema.eventInvites.assignmentId),
        )
        .where(
          and(
            eq(schema.eventInvites.tokenHash, hashToken(input.token)),
            isNull(schema.eventInvites.revokedAt),
            isNull(schema.eventInvites.acceptedAt),
            gt(schema.eventInvites.expiresAt, now),
            isNull(schema.eventRoleAssignments.deactivatedAt),
          ),
        );
      if (!row) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invito non valido, scaduto o revocato",
        });
      }
      await ctx.db
        .update(schema.eventInvites)
        .set({ acceptedAt: now })
        .where(eq(schema.eventInvites.id, row.invite.id));
      const sessionToken = await createInviteSession(
        ctx.db,
        row.invite.id,
        row.invite.expiresAt,
      );
      return {
        sessionToken,
        eventId: row.assignment.eventId,
        role: row.assignment.role,
      };
    }),

  revoke: verifiedProcedure
    .input(z.object({ inviteId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .select({
          invite: schema.eventInvites,
          assignment: schema.eventRoleAssignments,
        })
        .from(schema.eventInvites)
        .innerJoin(
          schema.eventRoleAssignments,
          eq(schema.eventRoleAssignments.id, schema.eventInvites.assignmentId),
        )
        .where(eq(schema.eventInvites.id, input.inviteId));
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      const event = await loadEventOrganization(ctx.db, row.assignment.eventId);
      if (
        !event ||
        !can(ctx.actor, "event.configure", {
          organizationId: event.organizationId,
        })
      ) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      await ctx.db
        .update(schema.eventInvites)
        .set({ revokedAt: new Date() })
        .where(eq(schema.eventInvites.id, input.inviteId));
      return { revoked: true };
    }),

  /** Sostituzione: disattiva l'assegnazione senza toccare le carte firmate. */
  deactivateAssignment: verifiedProcedure
    .input(z.object({ assignmentId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [assignment] = await ctx.db
        .select()
        .from(schema.eventRoleAssignments)
        .where(eq(schema.eventRoleAssignments.id, input.assignmentId));
      if (!assignment) throw new TRPCError({ code: "NOT_FOUND" });
      const event = await loadEventOrganization(ctx.db, assignment.eventId);
      if (
        !event ||
        !can(ctx.actor, "event.configure", {
          organizationId: event.organizationId,
        })
      ) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      await ctx.db
        .update(schema.eventRoleAssignments)
        .set({ deactivatedAt: new Date() })
        .where(eq(schema.eventRoleAssignments.id, input.assignmentId));
      return { deactivated: true };
    }),
});
