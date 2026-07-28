import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { schema, type Db } from "@penrunner/db";
import { personDisplayNameSql, personOfficialNameSql } from "../services/names.js";
import {
  combineCards,
  computeCardScore,
  computeEta,
  computeRanking,
  officiality,
  type RankingInput,
} from "@penrunner/core";
import { publicProcedure, router } from "../trpc.js";

// ---------------------------------------------------------------------------
// Viste derivate pubbliche: classifica live e vista evento (pagina evento e
// scoreboard consumano la STESSA query — la scoreboard è solo presentazione).
// Tutto ricalcolato a ogni richiesta: nessun dato derivato memorizzato.
// ---------------------------------------------------------------------------

type DbOrTx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

export interface ClassRankingRow {
  entryId: string;
  drawNumber: number | null;
  horseName: string;
  riderName: string;
  /** BR-84: resa "Cognome Nome" per i documenti ufficiali */
  riderOfficialName: string;
  riderId: string;
  position: number | null;
  sharedPosition: boolean;
  total: number | null;
  outcome: "scored" | "score_0" | "no_score";
  state: "scored" | "in_review" | "pending";
  prizeEligible: boolean;
  provisional: boolean;
  label: string | null;
}

export async function buildClassRanking(
  db: DbOrTx,
  classId: string,
  now = new Date(),
) {
  const [cls] = await db
    .select()
    .from(schema.classes)
    .where(eq(schema.classes.id, classId));
  if (!cls) throw new TRPCError({ code: "NOT_FOUND" });
  const [event] = await db
    .select()
    .from(schema.events)
    .where(eq(schema.events.id, cls.eventId));

  const judges = (
    await db
      .select()
      .from(schema.eventRoleAssignments)
      .where(
        and(
          eq(schema.eventRoleAssignments.eventId, cls.eventId),
          eq(schema.eventRoleAssignments.role, "giudice"),
          isNull(schema.eventRoleAssignments.deactivatedAt),
        ),
      )
  ).filter((j) => j.classId === null || j.classId === classId);

  const entries = await db
    .select({
      entry: schema.entries,
      horseName: schema.horses.name,
      riderName: personDisplayNameSql,
      // BR-84: i documenti ufficiali rendono "Cognome Nome" — il ranking
      // porta entrambe le rese, la scelta sta nel builder del documento.
      riderOfficialName: personOfficialNameSql,
    })
    .from(schema.entries)
    .innerJoin(schema.horses, eq(schema.horses.id, schema.entries.horseId))
    .innerJoin(schema.persons, eq(schema.persons.id, schema.entries.riderId))
    .where(eq(schema.entries.classId, classId));
  const activeEntries = entries.filter(
    (e) => !["bozza", "ritirata", "assente"].includes(e.entry.status),
  );
  const runs = activeEntries.length
    ? await db
        .select()
        .from(schema.runs)
        .where(
          inArray(
            schema.runs.entryId,
            activeEntries.map((e) => e.entry.id),
          ),
        )
    : [];
  const cards = runs.length
    ? await db
        .select()
        .from(schema.scoreCards)
        .where(
          inArray(
            schema.scoreCards.runId,
            runs.map((r) => r.id),
          ),
        )
    : [];
  const scores = cards.length
    ? await db
        .select({
          scoreCardId: schema.maneuverScores.scoreCardId,
          position: schema.patternManeuvers.position,
          quality: schema.maneuverScores.quality,
          penalty: schema.maneuverScores.penalty,
        })
        .from(schema.maneuverScores)
        .innerJoin(
          schema.patternManeuvers,
          eq(schema.patternManeuvers.id, schema.maneuverScores.maneuverId),
        )
        .where(
          inArray(
            schema.maneuverScores.scoreCardId,
            cards.map((c) => c.id),
          ),
        )
    : [];

  const input: Array<RankingInput<string>> = [];
  let lastRunClosedAt: Date | null = null;
  let allRunsComplete = runs.length > 0;
  let allPublished = runs.length > 0;

  for (const { entry } of activeEntries) {
    const run = runs.find((r) => r.entryId === entry.id);
    if (!run) {
      allRunsComplete = false;
      allPublished = false;
      input.push({
        ref: entry.id,
        state: "pending",
        outcome: "scored",
        total: null,
        provisional: true,
      });
      continue;
    }
    const runCards = cards.filter(
      (c) => c.runId === run.id && c.status !== "in_compilazione",
    );
    const signedAll =
      judges.length > 0 &&
      judges.every((j) =>
        runCards.some(
          (c) =>
            c.judgeId === j.personId &&
            (c.status === "firmata" || c.status === "validata"),
        ),
      );
    const closedAll =
      judges.length > 0 &&
      judges.every((j) => runCards.some((c) => c.judgeId === j.personId));
    if (run.status !== "pubblicata") allPublished = false;

    if (run.reviewHeldAt && !signedAll) {
      allRunsComplete = false;
      input.push({
        ref: entry.id,
        state: "in_review",
        outcome: "scored",
        total: null,
        provisional: true,
      });
      continue;
    }
    if (!closedAll) {
      allRunsComplete = false;
      input.push({
        ref: entry.id,
        state: "pending",
        outcome: "scored",
        total: null,
        provisional: true,
      });
      continue;
    }
    const breakdowns = runCards.map((c) =>
      computeCardScore({
        maneuvers: scores
          .filter((s) => s.scoreCardId === c.id)
          .map((s) => ({
            position: s.position,
            quality: Number(s.quality),
            penalty: Number(s.penalty),
          })),
        runPenalty: Number(c.runPenalty),
        special: c.special,
      }),
    );
    const combined = combineCards(breakdowns);
    const runClosedAt = runCards.reduce<Date | null>(
      (m, c) => (c.closedAt && (!m || c.closedAt > m) ? c.closedAt : m),
      null,
    );
    if (runClosedAt && (!lastRunClosedAt || runClosedAt > lastRunClosedAt)) {
      lastRunClosedAt = runClosedAt;
    }
    input.push({
      ref: entry.id,
      state: "scored",
      outcome: combined.outcome,
      total: combined.total,
      provisional: run.status !== "pubblicata",
    });
  }

  const ranking = computeRanking(input);
  const { official, officialAt } = officiality(
    allPublished && allRunsComplete,
    allRunsComplete ? lastRunClosedAt : null,
    now,
  );

  const enrich = (rows: typeof ranking.rows): ClassRankingRow[] =>
    rows.map((r) => {
      const e = activeEntries.find((x) => x.entry.id === r.ref)!;
      return {
        entryId: r.ref,
        drawNumber: e.entry.drawNumber,
        horseName: e.horseName,
        riderName: e.riderName,
        riderOfficialName: e.riderOfficialName,
        riderId: e.entry.riderId,
        position: r.position,
        sharedPosition: r.sharedPosition,
        total: r.total,
        outcome: r.outcome,
        state: r.state,
        prizeEligible: r.prizeEligible,
        provisional: r.provisional || !official,
        label: r.label,
      };
    });

  // fine go (flusso G): l'ultima run effettiva è completata (carte chiuse)
  const goComplete = activeEntries.length > 0 && allRunsComplete;

  return {
    cls,
    event: event!,
    judges,
    runs,
    ranking: enrich(ranking.rows),
    excluded: enrich(ranking.excluded),
    firstPlaceTie: ranking.firstPlaceTie,
    official,
    officialAt,
    goComplete,
  };
}

async function buildEta(db: DbOrTx, classId: string) {
  const data = await buildClassRanking(db, classId);
  const { cls, event, runs } = data;
  const entries = await db
    .select()
    .from(schema.entries)
    .where(and(eq(schema.entries.classId, classId)))
    .orderBy(asc(schema.entries.drawNumber));
  const drawn = entries.filter((e) => e.drawNumber !== null);
  const runByEntry = new Map(runs.map((r) => [r.entryId, r]));
  const started = runs
    .filter((r) => r.startedAt)
    .sort((a, b) => a.startedAt!.getTime() - b.startedAt!.getTime());
  const anchorMs = started.length
    ? started[started.length - 1]!.startedAt!.getTime()
    : null;
  const eta = computeEta(
    drawn.map((e) => ({
      ref: e.id,
      drawNumber: e.drawNumber!,
      effective: !["ritirata", "assente"].includes(e.status),
      done: (() => {
        const run = runByEntry.get(e.id);
        return run ? run.status !== "attesa" : false;
      })(),
    })),
    anchorMs,
    {
      slotSeconds: event.slotDurationS,
      dragEveryNRuns: event.dragEveryNRuns,
      dragSeconds: event.dragDurationS,
      observedStartsMs: started.map((r) => r.startedAt!.getTime()),
    },
  );
  return { data, eta, anchorMs, cls };
}

export const liveRouter = router({
  /** Calendario pubblico: eventi visibili (da "annunciato" in poi). */
  calendar: publicProcedure.query(async ({ ctx }) => {
    const events = await ctx.db
      .select()
      .from(schema.events)
      .where(inArray(schema.events.status, [
        "annunciato",
        "iscrizioni_aperte",
        "iscrizioni_chiuse",
        "in_corso",
        "concluso",
      ]))
      .orderBy(asc(schema.events.startDate));
    return events.map(publicEvent);
  }),

  /** ETA pubblica della start list di una classe (BR-50..54). */
  classEta: publicProcedure
    .input(z.object({ classId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { eta } = await buildEta(ctx.db, input.classId);
      return eta.map((e) => ({
        entryId: e.ref as string,
        runsBefore: e.runsBefore,
        etaMs: e.etaMs,
        etaAtMs: e.etaAtMs,
        mode: e.mode,
      }));
    }),

  /** Pagina pattern pubblica: passi testuali da patterns.json (mai diagrammi). */
  classPattern: publicProcedure
    .input(z.object({ classId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [cls] = await ctx.db
        .select()
        .from(schema.classes)
        .where(eq(schema.classes.id, input.classId));
      if (!cls) throw new TRPCError({ code: "NOT_FOUND" });
      const [pattern] = await ctx.db
        .select()
        .from(schema.patterns)
        .where(eq(schema.patterns.id, cls.patternId));
      const maneuvers = await ctx.db
        .select()
        .from(schema.patternManeuvers)
        .where(eq(schema.patternManeuvers.patternId, cls.patternId))
        .orderBy(asc(schema.patternManeuvers.position));
      return {
        className: cls.name,
        trotInImposed: cls.trotInImposed, // BR-26: violazione → score_0
        pattern: {
          code: pattern!.code,
          name: pattern!.name,
          entryGait: pattern!.entryGait,
          entryStart: pattern!.entryStart,
        },
        maneuvers: maneuvers.map((m) => ({
          position: m.position,
          labelIt: m.labelIt,
          labelEn: m.labelEn,
        })),
      };
    }),

  /** Classifica live di una classe (pubblica, derivata). */
  classRanking: publicProcedure
    .input(z.object({ classId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const data = await buildClassRanking(ctx.db, input.classId);
      return {
        className: data.cls.name,
        official: data.official,
        officialAt: data.officialAt,
        firstPlaceTie: data.firstPlaceTie,
        ranking: data.ranking,
        excluded: data.excluded,
        goComplete: data.goComplete,
      };
    }),

  /**
   * La vista live dell'evento: fonte dati COMUNE di pagina evento e
   * scoreboard (flusso G: a fine go passa automaticamente a classifica +
   * chi entra — tutto derivato, zero azioni manuali).
   */
  eventLive: publicProcedure
    .input(z.object({ eventId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [event] = await ctx.db
        .select()
        .from(schema.events)
        .where(eq(schema.events.id, input.eventId));
      if (!event) throw new TRPCError({ code: "NOT_FOUND" });
      const classes = await ctx.db
        .select()
        .from(schema.classes)
        .where(eq(schema.classes.eventId, input.eventId))
        .orderBy(asc(schema.classes.scheduledOrder), asc(schema.classes.createdAt));

      // Programma pubblico: le classi dell'evento (punto 9 del censimento —
      // la pagina evento dice ALMENO cosa si corre, con link a start list).
      const program = classes.map((c) => ({
        id: c.id,
        name: c.name,
        drawStatus: c.drawStatus,
      }));

      // classe a fuoco: quella con run in campo o la prima non completata
      let focus: (typeof classes)[number] | null = null;
      let focusData: Awaited<ReturnType<typeof buildEta>> | null = null;
      for (const cls of classes) {
        if (cls.drawStatus !== "pubblicato") continue;
        const built = await buildEta(ctx.db, cls.id);
        const hasOpenRuns = built.data.runs.some((r) =>
          ["attesa", "in_inserimento"].includes(r.status),
        );
        if (!focus || hasOpenRuns) {
          focus = cls;
          focusData = built;
        }
        if (hasOpenRuns) break;
      }
      if (!focus || !focusData) {
        return { event: publicEvent(event), classes: program, focus: null };
      }
      const { data, eta } = focusData;

      const entriesById = new Map(data.ranking.map((r) => [r.entryId, r]));
      const inFieldRun = data.runs
        .filter((r) => r.status === "in_inserimento")
        .sort(
          (a, b) =>
            (b.startedAt?.getTime() ?? 0) - (a.startedAt?.getTime() ?? 0),
        )[0];
      const inField = inFieldRun
        ? await entrySummary(ctx.db, inFieldRun.entryId)
        : null;

      // "precedente": l'ultima run con carte chiuse
      const scoredRows = data.ranking.filter((r) => r.state === "scored");
      const lastScored = [...data.runs]
        .filter((r) => entriesById.get(r.entryId)?.state === "scored")
        .sort(
          (a, b) =>
            (b.startedAt?.getTime() ?? 0) - (a.startedAt?.getTime() ?? 0),
        )[0];
      const previous = lastScored
        ? {
            ...(await entrySummary(ctx.db, lastScored.entryId)),
            total: entriesById.get(lastScored.entryId)?.total ?? null,
            outcome: entriesById.get(lastScored.entryId)?.outcome,
            provisional: entriesById.get(lastScored.entryId)?.provisional,
          }
        : null;

      const nextUp = [];
      for (const e of eta.slice(0, 3)) {
        nextUp.push({
          ...(await entrySummary(ctx.db, e.ref as string)),
          etaMs: e.etaMs,
          etaAtMs: e.etaAtMs,
          runsBefore: e.runsBefore,
          mode: e.mode,
        });
      }

      const leader =
        scoredRows.find((r) => r.position === 1 && r.outcome === "scored") ??
        null;

      // fine go: classifica + start list di chi entra (classe successiva)
      let nextClassStartList = null;
      if (data.goComplete) {
        const idx = classes.findIndex((c) => c.id === focus!.id);
        const next = classes
          .slice(idx + 1)
          .find((c) => c.drawStatus === "pubblicato");
        if (next) {
          const nextEta = await buildEta(ctx.db, next.id);
          nextClassStartList = {
            classId: next.id,
            className: next.name,
            entries: await Promise.all(
              nextEta.eta.slice(0, 10).map(async (e) => ({
                ...(await entrySummary(ctx.db, e.ref as string)),
                etaMs: e.etaMs,
                mode: e.mode,
              })),
            ),
          };
        }
      }

      return {
        event: publicEvent(event),
        classes: program,
        focus: {
          classId: focus.id,
          className: focus.name,
          goComplete: data.goComplete,
          official: data.official,
          officialAt: data.officialAt,
          firstPlaceTie: data.firstPlaceTie,
          inField,
          previous,
          nextUp,
          leader,
          ranking: data.ranking,
          excluded: data.excluded,
          nextClassStartList,
        },
      };
    }),
});

function publicEvent(event: typeof schema.events.$inferSelect) {
  return {
    id: event.id,
    name: event.name,
    venue: event.venue,
    startDate: event.startDate,
    endDate: event.endDate,
    tier: event.tier,
    themePrimary: event.themePrimary,
    heroImage: event.heroImage,
    status: event.status,
    sponsorName: event.sponsorName,
    sponsorImageUrl: event.sponsorImageUrl,
  };
}

async function entrySummary(db: DbOrTx, entryId: string) {
  const [row] = await db
    .select({
      entryId: schema.entries.id,
      drawNumber: schema.entries.drawNumber,
      horseName: schema.horses.name,
      riderName: personDisplayNameSql,
    })
    .from(schema.entries)
    .innerJoin(schema.horses, eq(schema.horses.id, schema.entries.horseId))
    .innerJoin(schema.persons, eq(schema.persons.id, schema.entries.riderId))
    .where(eq(schema.entries.id, entryId));
  return row!;
}
