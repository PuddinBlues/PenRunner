import { TRPCError } from "@trpc/server";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { schema } from "@penrunner/db";
import { can } from "../policy/policy.js";
import { personDisplayNameSql } from "../services/names.js";
import { router, verifiedProcedure } from "../trpc.js";

// ---------------------------------------------------------------------------
// Roster scuderia. Modello identità ("primo creatore, gli altri collegano"):
// il cavallo si deduplica sul microchip, il cavaliere sull'email — aggiungere
// qualcosa che esiste già COLLEGA il record, non lo duplica.
// ---------------------------------------------------------------------------

function requireRosterAccess(
  actor: Parameters<typeof can>[0],
  stableId: string,
) {
  if (!can(actor, "roster.manage", { stableId })) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
}

export const rosterRouter = router({
  createStable: verifiedProcedure
    .input(z.object({ name: z.string().min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.actor.personId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Completa prima il profilo",
        });
      }
      const [stable] = await ctx.db
        .insert(schema.stables)
        .values({ name: input.name, referentId: ctx.actor.personId })
        .returning();
      return { stableId: stable!.id };
    }),

  /** Aggiunge un cavallo: se il microchip esiste, collega (cambio scuderia). */
  addHorse: verifiedProcedure
    .input(
      z.object({
        stableId: z.string().uuid(),
        microchip: z.string().min(1).max(50),
        name: z.string().min(1).max(200),
        ownerPersonId: z.string().uuid().optional(),
        ueln: z.string().max(50).optional(),
        competitionLicense: z.string().max(50).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireRosterAccess(ctx.actor, input.stableId);
      const [existing] = await ctx.db
        .select()
        .from(schema.horses)
        .where(eq(schema.horses.microchip, input.microchip));
      if (existing) {
        // Stesso microchip = stesso cavallo: il "cambio scuderia" è
        // l'aggiornamento della relazione stabled-at, mai un clone.
        await ctx.db
          .update(schema.horses)
          .set({ stableId: input.stableId })
          .where(eq(schema.horses.id, existing.id));
        return { horseId: existing.id, linked: true as const };
      }
      if (!input.ownerPersonId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Indica il proprietario per creare un cavallo nuovo",
        });
      }
      const [horse] = await ctx.db
        .insert(schema.horses)
        .values({
          name: input.name,
          microchip: input.microchip,
          ownerId: input.ownerPersonId,
          stableId: input.stableId,
          ueln: input.ueln ?? null,
          competitionLicense: input.competitionLicense ?? null,
        })
        .returning();
      return { horseId: horse!.id, linked: false as const };
    }),

  /** Aggiunge un cavaliere al roster: se l'email esiste, collega la person. */
  addRider: verifiedProcedure
    .input(
      z.object({
        stableId: z.string().uuid(),
        // BR-84: nome strutturato — dai form entrambi i campi, sempre.
        firstName: z.string().min(1).max(100),
        lastName: z.string().min(1).max(100),
        email: z.string().email().optional(),
        birthDate: z.string().date().optional(),
        membershipIrha: z.string().max(50).optional(),
        membershipFise: z.string().max(50).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireRosterAccess(ctx.actor, input.stableId);
      const result = await ctx.db.transaction(async (tx) => {
        let personId: string | undefined;
        if (input.email) {
          const normalized = input.email.toLowerCase();
          const [existing] = await tx
            .select()
            .from(schema.persons)
            .where(sql`lower(${schema.persons.email}) = ${normalized}`);
          // Il profilo resta uno (e rivendicabile): non si sovrascrivono i
          // dati di una person esistente, si collega la membership.
          personId = existing?.id;
        }
        const linked = personId !== undefined;
        if (!personId) {
          const [created] = await tx
            .insert(schema.persons)
            .values({
              firstName: input.firstName,
              lastName: input.lastName,
              email: input.email?.toLowerCase() ?? null,
              birthDate: input.birthDate ?? null,
              membershipIrha: input.membershipIrha ?? null,
              membershipFise: input.membershipFise ?? null,
            })
            .returning();
          personId = created!.id;
        }
        await tx
          .insert(schema.stableMembers)
          .values({ stableId: input.stableId, personId })
          .onConflictDoNothing();
        return { personId, linked };
      });
      // linked = email già registrata: profilo COLLEGATO, mai duplicato — la
      // UI lo dice esplicitamente al referente (come addHorse col microchip).
      return result;
    }),

  /**
   * Aggiornamento del profilo dal roster: nome (BR-84, spegne il flag di
   * revisione) E i campi che risolvono gli avvisi di eleggibilità — chi VEDE
   * l'avviso può sistemarlo (fase b del programma qualità): tesseramenti e
   * data di nascita. Si aggiorna solo chi è nel PROPRIO roster; le carte
   * firmate referenziano la Person e non vengono toccate.
   */
  updateRider: verifiedProcedure
    .input(
      z.object({
        stableId: z.string().uuid(),
        personId: z.string().uuid(),
        firstName: z.string().min(1).max(100),
        lastName: z.string().min(1).max(100),
        membershipIrha: z.string().max(50).nullable().optional(),
        membershipFise: z.string().max(50).nullable().optional(),
        birthDate: z.string().date().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireRosterAccess(ctx.actor, input.stableId);
      const [membership] = await ctx.db
        .select()
        .from(schema.stableMembers)
        .where(
          and(
            eq(schema.stableMembers.stableId, input.stableId),
            eq(schema.stableMembers.personId, input.personId),
          ),
        );
      if (!membership) throw new TRPCError({ code: "NOT_FOUND" });
      await ctx.db
        .update(schema.persons)
        .set({
          firstName: input.firstName,
          lastName: input.lastName,
          nameNeedsReview: false,
          ...(input.membershipIrha !== undefined
            ? { membershipIrha: input.membershipIrha || null }
            : {}),
          ...(input.membershipFise !== undefined
            ? { membershipFise: input.membershipFise || null }
            : {}),
          ...(input.birthDate !== undefined
            ? { birthDate: input.birthDate || null }
            : {}),
        })
        .where(eq(schema.persons.id, input.personId));
      return { ok: true };
    }),

  /** Le scuderie di cui l'utente è referente (gate d'ingresso dell'app). */
  myStables: verifiedProcedure.query(async ({ ctx }) => {
    if (!ctx.actor.personId) return [];
    return ctx.db
      .select({ stableId: schema.stables.id, name: schema.stables.name })
      .from(schema.stables)
      .where(eq(schema.stables.referentId, ctx.actor.personId))
      .orderBy(schema.stables.createdAt);
  }),

  list: verifiedProcedure
    .input(z.object({ stableId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      requireRosterAccess(ctx.actor, input.stableId);
      const members = await ctx.db
        .select({
          personId: schema.persons.id,
          // fullName resta nel contratto: composto server-side (BR-84).
          fullName: personDisplayNameSql,
          firstName: schema.persons.firstName,
          lastName: schema.persons.lastName,
          nameNeedsReview: schema.persons.nameNeedsReview,
          email: schema.persons.email,
          membershipIrha: schema.persons.membershipIrha,
          membershipFise: schema.persons.membershipFise,
          birthDate: schema.persons.birthDate,
        })
        .from(schema.stableMembers)
        .innerJoin(
          schema.persons,
          eq(schema.persons.id, schema.stableMembers.personId),
        )
        .where(eq(schema.stableMembers.stableId, input.stableId))
        // BR-84: gli elenchi alfabetici ordinano per (cognome, nome).
        .orderBy(
          sql`lower(${schema.persons.lastName})`,
          sql`lower(${schema.persons.firstName})`,
        );
      const horses = await ctx.db
        .select()
        .from(schema.horses)
        .where(eq(schema.horses.stableId, input.stableId));
      return { members, horses };
    }),
});
