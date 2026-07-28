import { TRPCError } from "@trpc/server";
import { and, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { schema, type Db } from "@penrunner/db";
import {
  computePayout,
  computePurse,
  selectPaybackBand,
  type Placement,
} from "@penrunner/core";
import { can } from "../policy/policy.js";
import { PAYBACK_A } from "../services/payback.js";
import { router, verifiedProcedure } from "../trpc.js";
import { buildClassRanking, type ClassRankingRow } from "./live.js";

type DbOrTx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

const toCents = (v: string | number) => Math.round(Number(v) * 100);

/**
 * Payout di classe: vista DERIVATA. Combina la classifica eligibile (dallo
 * step 6) col montepremi e la tabella Payback A. Mai memorizzato.
 */
export async function buildClassPayout(db: DbOrTx, classId: string) {
  const ranking = await buildClassRanking(db, classId);
  const { cls } = ranking;

  // Cavalli iscritti confermati, scratch inclusi (BR-33/BR-03): base sia per
  // la fascia sia per le quote iscrizione del purse.
  const confirmed = await db
    .select({ id: schema.entries.id })
    .from(schema.entries)
    .where(
      and(
        eq(schema.entries.classId, classId),
        ne(schema.entries.status, "bozza"),
      ),
    );
  const confirmedEntries = confirmed.length;

  const purse = computePurse({
    confirmedEntries,
    entryFeeCents: toCents(cls.entryFee),
    addedMoneyCents: toCents(cls.addedMoney),
    trophyCostCents: toCents(cls.trophyCost),
  });

  // Piazzamenti ELIGIBILI (BR-31: score_0/no_score già esclusi), raggruppati
  // per posizione (pari merito = più refs sullo stesso rango).
  const eligible = ranking.ranking.filter(
    (r) => r.prizeEligible && r.position !== null,
  );
  const byRank = new Map<number, ClassRankingRow[]>();
  for (const r of eligible) {
    const list = byRank.get(r.position!) ?? [];
    list.push(r);
    byRank.set(r.position!, list);
  }
  const placements: Placement<string>[] = [...byRank.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([rank, rows]) => ({ rank, refs: rows.map((x) => x.entryId) }));

  const band = selectPaybackBand(PAYBACK_A, confirmedEntries);
  const payout = computePayout({ purseCents: purse.purseCents, band, placements });

  // arricchimento con i nomi per il report/PDF (BR-84: resa ufficiale)
  const entryName = new Map(
    ranking.ranking.map((r) => [
      r.entryId,
      {
        horseName: r.horseName,
        riderName: r.riderName,
        riderOfficialName: r.riderOfficialName,
      },
    ]),
  );

  return {
    cls,
    event: ranking.event,
    official: ranking.official,
    firstPlaceTie: ranking.firstPlaceTie,
    confirmedEntries,
    purse,
    band,
    payout: {
      ...payout,
      placements: payout.placements.map((p) => ({
        ...p,
        binomi: p.refs.map((ref, i) => ({
          entryId: ref,
          ...(entryName.get(ref) ?? {
            horseName: "?",
            riderName: "?",
            riderOfficialName: "?",
          }),
          amountCents: p.perRefCents[i] ?? 0,
        })),
      })),
    },
  };
}

export const payoutRouter = router({
  /** Report payout di classe (organizzatore/segreteria). */
  classPayout: verifiedProcedure
    .input(z.object({ classId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const data = await buildClassPayout(ctx.db, input.classId);
      if (
        !can(ctx.actor, "payout.manage", {
          organizationId: data.event.organizationId,
          eventId: data.event.id,
        })
      ) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return {
        className: data.cls.name,
        official: data.official,
        firstPlaceTie: data.firstPlaceTie,
        confirmedEntries: data.confirmedEntries,
        // purse SEMPRE scomposto — fonte normativa: ART. 15
        purse: data.purse,
        purseFormulaNote:
          "Montepremi ex ART. 15 Reg. Disciplina Reining FISE/IRHA 2025: iscrizioni + added money − trofei − 20% spese org. (*base del 20%: sole iscrizioni — da precisare con la segreteria)",
        placesPaid: data.band.places_paid,
        distributedCents: data.payout.distributedCents,
        undistributedCents: data.payout.undistributedCents,
        placements: data.payout.placements.map((p) => ({
          rank: p.rank,
          amountCents: p.amountCents,
          binomi: p.binomi,
        })),
      };
    }),
});
