import { TRPCError } from "@trpc/server";
import { desc, eq, inArray, sql } from "drizzle-orm";
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
  /**
   * Creare l'evento in BOZZA non richiede il vetting: un'organizzazione in
   * verifica prepara tutto da sola (BR-80); è la pubblicazione a essere
   * gated (setStatus).
   */
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
        !can(ctx.actor, "event.prepare", {
          organizationId: input.organizationId,
        })
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Serve un'organizzazione di cui sei titolare per creare eventi",
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
        // BR-80: chi può preparare ma non pubblicare deve capire cosa manca,
        // non ricevere un no secco: il vetting è il passo successivo.
        if (
          can(ctx.actor, "event.prepare", {
            organizationId: event.organizationId,
          })
        ) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "L'organizzazione è in verifica: puoi preparare l'evento in bozza; per annunciarlo e aprire le iscrizioni serve l'approvazione di PenRunner",
          });
        }
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

  /**
   * Configurazione evento dal wizard. platform_fee_per_horse e
   * draw_surgery_enabled NON sono qui: li scrive solo il Platform Admin
   * (BR-02/BR-43), l'organizzatore li vede read-only in events.get.
   */
  update: verifiedProcedure
    .input(
      z.object({
        eventId: z.string().uuid(),
        name: z.string().min(1).max(200).optional(),
        venue: z.string().min(1).max(200).optional(),
        startDate: z.string().date().optional(),
        endDate: z.string().date().optional(),
        tier: z
          .enum(["regionale", "nazionale", "internazionale", "premium"])
          .optional(),
        themePrimary: z.string().max(20).nullable().optional(),
        themeSecondary: z.string().max(20).nullable().optional(),
        heroImage: z.string().max(2000).nullable().optional(),
        feePerHorse: z.string().optional(),
        selfScratchEnabled: z.boolean().optional(),
        slotDurationS: z.number().int().min(1).optional(),
        dragEveryNRuns: z.number().int().min(1).optional(),
        dragDurationS: z.number().int().min(0).optional(),
        sponsorName: z.string().max(200).nullable().optional(),
        sponsorImageUrl: z.string().max(2000).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [event] = await ctx.db
        .select()
        .from(schema.events)
        .where(eq(schema.events.id, input.eventId));
      if (!event) throw new TRPCError({ code: "NOT_FOUND" });
      if (
        !can(ctx.actor, "event.prepare", {
          organizationId: event.organizationId,
        })
      ) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      // BR-03: la fee matura alla conferma dell'iscrizione. Cambiare il
      // prezzo al cavaliere a iscrizioni aperte cambierebbe retroattivamente
      // le fee derivate: si fissa prima dell'apertura.
      if (
        input.feePerHorse !== undefined &&
        event.status !== "bozza" &&
        event.status !== "annunciato"
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "La quota al cavaliere si fissa prima dell'apertura iscrizioni",
        });
      }
      const { eventId: _ignored, ...fields } = input;
      const changes = Object.fromEntries(
        Object.entries(fields).filter(([, v]) => v !== undefined),
      );
      if (Object.keys(changes).length === 0) return { updated: false };
      await ctx.db
        .update(schema.events)
        .set(changes)
        .where(eq(schema.events.id, input.eventId));
      return { updated: true };
    }),

  /** Gli eventi delle mie organizzazioni (lista back-office). */
  mine: verifiedProcedure.query(async ({ ctx }) => {
    const orgIds = ctx.actor.organizations.map((m) => m.organizationId);
    if (orgIds.length === 0) return [];
    const rows = await ctx.db
      .select({
        id: schema.events.id,
        organizationId: schema.events.organizationId,
        name: schema.events.name,
        venue: schema.events.venue,
        startDate: schema.events.startDate,
        endDate: schema.events.endDate,
        tier: schema.events.tier,
        status: schema.events.status,
        // Qualificazione a mano: dentro sql`` Drizzle non qualifica le colonne.
        classesCount: sql<number>`(select count(*) from ${schema.classes} c where c.event_id = ${schema.events}.id)::int`,
      })
      .from(schema.events)
      .where(inArray(schema.events.organizationId, orgIds))
      .orderBy(desc(schema.events.startDate));
    return rows;
  }),

  /**
   * Dettaglio evento per l'organizzatore. La quota PenRunner effettiva e il
   * margine sono mostrati (read-only): la leva commerciale si vede, non si
   * tocca (BR-02).
   */
  get: verifiedProcedure
    .input(z.object({ eventId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .select({ event: schema.events, org: schema.organizations })
        .from(schema.events)
        .innerJoin(
          schema.organizations,
          eq(schema.organizations.id, schema.events.organizationId),
        )
        .where(eq(schema.events.id, input.eventId));
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      const { event, org } = row;
      if (
        !can(ctx.actor, "event.prepare", {
          organizationId: event.organizationId,
        })
      ) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const feePerHorse = Number(event.feePerHorse);
      const platformFeePerHorse = Number(
        event.platformFeePerHorse ?? org.platformFeePerHorse,
      );
      const membership = ctx.actor.organizations.find(
        (m) => m.organizationId === event.organizationId,
      );
      return {
        ...event,
        organizationName: org.name,
        organizationVetted: membership?.vetted ?? false,
        vettingStatus: org.vettingStatus,
        // Derivati, mai memorizzati (BR-02): quota effettiva e margine unitario.
        effectivePlatformFeePerHorse: platformFeePerHorse,
        organizerMarginPerHorse: feePerHorse - platformFeePerHorse,
      };
    }),
});

export async function loadEventOrganization(db: Db, eventId: string) {
  const [event] = await db
    .select({ id: schema.events.id, organizationId: schema.events.organizationId })
    .from(schema.events)
    .where(eq(schema.events.id, eventId));
  return event;
}
