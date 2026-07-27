import { TRPCError } from "@trpc/server";
import { eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { schema } from "@penrunner/db";
import { can } from "../policy/policy.js";
import { router, verifiedProcedure } from "../trpc.js";

// ---------------------------------------------------------------------------
// Fee: SEMPRE viste derivate, mai memorizzate (BR-01/02/30). Il conteggio è
// sui cavalli distinti delle iscrizioni confermate in poi — ritiri e assenze
// INCLUSI: la fee matura alla conferma ed è dovuta a prescindere (BR-03).
// ---------------------------------------------------------------------------

export const feesRouter = router({
  /** Riepilogo per l'organizzatore: fee al cavaliere, quota PenRunner, margine. */
  summary: verifiedProcedure
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
        !can(ctx.actor, "payout.manage", {
          organizationId: event.organizationId,
          eventId: event.id,
        })
      ) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const [count] = await ctx.db
        .select({
          horses: sql<number>`count(distinct ${schema.entries.horseId})::int`,
        })
        .from(schema.entries)
        .innerJoin(schema.classes, eq(schema.classes.id, schema.entries.classId))
        .where(
          sql`${schema.classes.eventId} = ${input.eventId} and ${ne(
            schema.entries.status,
            "bozza",
          )}`,
        );

      const distinctHorses = count?.horses ?? 0;
      const feePerHorse = Number(event.feePerHorse);
      // BR-02: override evento, altrimenti quota dell'organizzazione.
      const platformFeePerHorse = Number(
        event.platformFeePerHorse ?? org.platformFeePerHorse,
      );
      const riderFeeTotal = distinctHorses * feePerHorse;
      const platformFeeTotal = distinctHorses * platformFeePerHorse;
      return {
        distinctHorses,
        feePerHorse,
        platformFeePerHorse,
        riderFeeTotal,
        platformFeeTotal,
        // Il margine (leva commerciale) mostrato all'organizzatore nel wizard.
        organizerMargin: riderFeeTotal - platformFeeTotal,
      };
    }),
});
