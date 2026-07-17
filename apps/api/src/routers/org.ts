import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { schema, type Db } from "@penrunner/db";
import { can } from "../policy/policy.js";
import { router, verifiedProcedure } from "../trpc.js";

export const orgRouter = router({
  /** Richiesta accesso organizzatore: nasce sempre in vetting (decisione ratificata). */
  create: verifiedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(200),
        affiliationCode: z.string().max(100).optional(),
        contactEmail: z.string().email().optional(),
        contactPhone: z.string().max(50).optional(),
        iban: z.string().max(50).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const personId = ctx.actor.personId;
      if (!personId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Completa prima il profilo",
        });
      }
      const organizationId = await ctx.db.transaction(async (tx) => {
        const [org] = await tx
          .insert(schema.organizations)
          .values({
            name: input.name,
            affiliationCode: input.affiliationCode ?? null,
            contactEmail: input.contactEmail ?? null,
            contactPhone: input.contactPhone ?? null,
            iban: input.iban ?? null,
          })
          .returning();
        await tx.insert(schema.organizationMembers).values({
          organizationId: org!.id,
          personId,
          role: "titolare",
        });
        return org!.id;
      });
      return { organizationId, vettingStatus: "in_verifica" as const };
    }),

  mine: verifiedProcedure.query(async ({ ctx }) => {
    return ctx.actor.organizations;
  }),
});

export const eventsRouter = router({
  /** Creare eventi richiede un'organizzazione con vetting superato. */
  create: verifiedProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        name: z.string().min(1).max(200),
        venue: z.string().min(1).max(200),
        startDate: z.string().date(),
        endDate: z.string().date(),
        tier: z
          .enum(["regionale", "nazionale", "internazionale", "premium"])
          .optional(),
        feePerHorse: z.string().optional(),
        selfScratchEnabled: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (
        !can(ctx.actor, "event.configure", {
          organizationId: input.organizationId,
        })
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Serve un'organizzazione verificata di cui sei titolare per creare eventi",
        });
      }
      const [event] = await ctx.db
        .insert(schema.events)
        .values({
          organizationId: input.organizationId,
          name: input.name,
          venue: input.venue,
          startDate: input.startDate,
          endDate: input.endDate,
          ...(input.tier ? { tier: input.tier } : {}),
          ...(input.feePerHorse ? { feePerHorse: input.feePerHorse } : {}),
          ...(input.selfScratchEnabled !== undefined
            ? { selfScratchEnabled: input.selfScratchEnabled }
            : {}),
        })
        .returning();
      return { eventId: event!.id, status: event!.status };
    }),

  /** Avanza lo stato dell'evento (solo in avanti, macchina a stati della spec). */
  setStatus: verifiedProcedure
    .input(
      z.object({
        eventId: z.string().uuid(),
        status: z.enum([
          "bozza",
          "annunciato",
          "iscrizioni_aperte",
          "iscrizioni_chiuse",
          "in_corso",
          "concluso",
        ]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [event] = await ctx.db
        .select()
        .from(schema.events)
        .where(eq(schema.events.id, input.eventId));
      if (!event) throw new TRPCError({ code: "NOT_FOUND" });
      if (
        !can(ctx.actor, "event.configure", {
          organizationId: event.organizationId,
        })
      ) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const order = [
        "bozza",
        "annunciato",
        "iscrizioni_aperte",
        "iscrizioni_chiuse",
        "in_corso",
        "concluso",
      ];
      if (order.indexOf(input.status) <= order.indexOf(event.status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Transizione non valida: ${event.status} → ${input.status}`,
        });
      }
      await ctx.db
        .update(schema.events)
        .set({ status: input.status })
        .where(eq(schema.events.id, input.eventId));
      return { status: input.status };
    }),
});

export async function loadEventOrganization(db: Db, eventId: string) {
  const [event] = await db
    .select({ id: schema.events.id, organizationId: schema.events.organizationId })
    .from(schema.events)
    .where(eq(schema.events.id, eventId));
  return event;
}
