import { TRPCError } from "@trpc/server";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { schema, type Db } from "@penrunner/db";
import { displayName } from "../services/names.js";
import { router, verifiedProcedure } from "../trpc.js";

// ---------------------------------------------------------------------------
// Claim e creazione profilo. Modello identità della spec: "primo creatore,
// gli altri collegano". Il claim si conclude SOLO con email verificata
// (verifiedProcedure): senza, chiunque conosca l'email di un cavaliere
// potrebbe rivendicarne il profilo.
// ---------------------------------------------------------------------------

async function findClaimablePerson(db: Db, email: string) {
  // Person con la stessa email non ancora collegata ad alcun account.
  const [person] = await db
    .select()
    .from(schema.persons)
    .where(
      and(
        sql`lower(${schema.persons.email}) = ${email.toLowerCase()}`,
        sql`not exists (select 1 from ${schema.users} where ${schema.users.personId} = ${schema.persons.id})`,
      ),
    );
  return person;
}

export const profileRouter = router({
  /** C'è un profilo creato da altri (es. una scuderia) da rivendicare? */
  claimStatus: verifiedProcedure.query(async ({ ctx }) => {
    if (ctx.actor.personId) return { claimable: null };
    const [user] = await ctx.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, ctx.actor.userId));
    const person = await findClaimablePerson(ctx.db, user!.email);
    return person
      ? { claimable: { personId: person.id, fullName: displayName(person) } }
      : { claimable: null };
  }),

  /** Rivendica il profilo esistente: il collegamento mantiene la scuderia. */
  claimAccept: verifiedProcedure.mutation(async ({ ctx }) => {
    if (ctx.actor.personId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Hai già un profilo collegato",
      });
    }
    const [user] = await ctx.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, ctx.actor.userId));
    const person = await findClaimablePerson(ctx.db, user!.email);
    if (!person) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Nessun profilo da rivendicare",
      });
    }
    await ctx.db
      .update(schema.users)
      .set({ personId: person.id })
      .where(eq(schema.users.id, ctx.actor.userId));
    return { personId: person.id };
  }),

  /** Crea un profilo nuovo (nessun claim disponibile, o rifiutato). */
  create: verifiedProcedure
    .input(
      z.object({
        // BR-84: nome strutturato dai form, sempre entrambi i campi.
        firstName: z.string().min(1).max(100),
        lastName: z.string().min(1).max(100),
        locale: z.enum(["it", "en"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.actor.personId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Hai già un profilo collegato",
        });
      }
      const [user] = await ctx.db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, ctx.actor.userId));
      const personId = await ctx.db.transaction(async (tx) => {
        const [person] = await tx
          .insert(schema.persons)
          .values({
            firstName: input.firstName,
            lastName: input.lastName,
            email: user!.email,
            ...(input.locale ? { locale: input.locale } : {}),
          })
          .returning();
        await tx
          .update(schema.users)
          .set({ personId: person!.id })
          .where(
            and(
              eq(schema.users.id, ctx.actor.userId),
              isNull(schema.users.personId),
            ),
          );
        return person!.id;
      });
      return { personId };
    }),
});
