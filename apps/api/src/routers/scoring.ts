import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { schema, type Db } from "@penrunner/db";
import {
  computeCardScore,
  SCORING_ENGINE_VERSION,
  ScoringError,
  type CardInput,
} from "@penrunner/core";
import { can } from "../policy/policy.js";
import { recordAudit } from "../services/audit.js";
import { renderMail } from "../services/mailtemplate.js";
import { liveBus } from "../services/livebus.js";
import { publicProcedure, router, verifiedProcedure } from "../trpc.js";
import { buildClassRanking } from "./live.js";

// ---------------------------------------------------------------------------
// Lato server dello scoring offline-first (BR-20..29, 40).
// - La sync è idempotente (client_card_id) e per-carta: retry e arrivi fuori
//   ordine sono sicuri; l'orologio del device non decide MAI un conflitto.
// - Il totale non si memorizza: il server RICALCOLA dagli input e confronta
//   col totale mostrato alla chiusura — un mismatch non è mai silenzioso
//   (audit + flag che blocca l'auto-validazione).
// - Backfill BR-28: stessa validazione del motore, firma digitale mai
//   simulata (vincolo di database), sempre auditato.
// - Correzioni BR-40: lo snapshot prima/dopo in audit È il versionamento.
// ---------------------------------------------------------------------------

type DbOrTx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000;
const RUN_STATUS_ORDER = [
  "attesa",
  "in_inserimento",
  "in_attesa_firma",
  "validata",
  "pubblicata",
] as const;

const maneuverInput = z.object({
  position: z.number().int().min(1),
  quality: z.number().nullable(),
  penalty: z.number(),
});

const syncCardInput = z.object({
  clientCardId: z.string().uuid(),
  runId: z.string().uuid(),
  judgeId: z.string().uuid(),
  maneuvers: z.array(maneuverInput).min(1).max(10),
  runPenalty: z.number(),
  special: z.enum(["score_0", "no_score"]).nullable(),
  status: z.enum(["chiusa", "firmata"]),
  closedAt: z.string().datetime(),
  displayedTotal: z.number().nullable(),
  engineVersion: z.string(),
  signedAt: z.string().datetime().nullable(),
  signatureStroke: z.string().max(100_000).nullable(),
});

const syncEventInput = z.object({
  clientEventId: z.string(),
  runId: z.string().uuid(),
  type: z.enum(["sent_to_field", "held_for_review", "reopened"]),
  at: z.string().datetime(),
  note: z.string().max(2000).optional(),
  /** held_for_review: la manovra del dubbio (BR-29) */
  position: z.number().int().min(1).optional(),
});

async function loadRunContext(db: DbOrTx, runId: string) {
  const [row] = await db
    .select({
      run: schema.runs,
      entry: schema.entries,
      cls: schema.classes,
      event: schema.events,
    })
    .from(schema.runs)
    .innerJoin(schema.entries, eq(schema.entries.id, schema.runs.entryId))
    .innerJoin(schema.classes, eq(schema.classes.id, schema.entries.classId))
    .innerJoin(schema.events, eq(schema.events.id, schema.classes.eventId))
    .where(eq(schema.runs.id, runId));
  return row;
}

async function patternManeuverIds(db: DbOrTx, patternId: string) {
  const rows = await db
    .select()
    .from(schema.patternManeuvers)
    .where(eq(schema.patternManeuvers.patternId, patternId))
    .orderBy(asc(schema.patternManeuvers.position));
  return new Map(rows.map((m) => [m.position, m.id]));
}

function toCardInput(payload: {
  maneuvers: Array<{ position: number; quality: number | null; penalty: number }>;
  runPenalty: number;
  special: "score_0" | "no_score" | null;
}): CardInput {
  return {
    maneuvers: payload.maneuvers,
    runPenalty: payload.runPenalty,
    special: payload.special,
  };
}

/** Avanzamento forward-only della macchina a stati della run. */
async function advanceRun(
  tx: DbOrTx,
  run: typeof schema.runs.$inferSelect,
  to: (typeof RUN_STATUS_ORDER)[number],
  extra: Partial<typeof schema.runs.$inferInsert> = {},
): Promise<boolean> {
  if (RUN_STATUS_ORDER.indexOf(to) <= RUN_STATUS_ORDER.indexOf(run.status)) {
    return false; // evento stantio: ignorato, non è un errore
  }
  await tx
    .update(schema.runs)
    .set({ status: to, ...extra })
    .where(eq(schema.runs.id, run.id));
  return true;
}

async function replaceManeuverScores(
  tx: DbOrTx,
  scoreCardId: string,
  patternId: string,
  maneuvers: Array<{ position: number; quality: number | null; penalty: number }>,
) {
  const byPosition = await patternManeuverIds(tx, patternId);
  await tx
    .delete(schema.maneuverScores)
    .where(eq(schema.maneuverScores.scoreCardId, scoreCardId));
  for (const m of maneuvers) {
    const maneuverId = byPosition.get(m.position);
    if (!maneuverId) {
      throw new ScoringError(`manovra ${m.position} assente dal pattern`);
    }
    await tx.insert(schema.maneuverScores).values({
      scoreCardId,
      maneuverId,
      quality: String(m.quality ?? 0),
      penalty: String(m.penalty),
    });
  }
}

/** I giudici attivi rilevanti per la run (assegnazione evento o della classe). */
async function relevantJudges(
  tx: DbOrTx,
  runCtx: NonNullable<Awaited<ReturnType<typeof loadRunContext>>>,
) {
  const judges = await tx
    .select()
    .from(schema.eventRoleAssignments)
    .where(
      and(
        eq(schema.eventRoleAssignments.eventId, runCtx.event.id),
        eq(schema.eventRoleAssignments.role, "giudice"),
        isNull(schema.eventRoleAssignments.deactivatedAt),
      ),
    );
  return judges.filter((j) => j.classId === null || j.classId === runCtx.cls.id);
}

/** BR-29: la run resta in review finché tutte le carte sono chiuse e firmate. */
function isRunInReview(
  run: typeof schema.runs.$inferSelect,
  judges: Array<{ personId: string }>,
  cards: Array<typeof schema.scoreCards.$inferSelect>,
): boolean {
  if (run.reviewHeldAt === null) return false;
  const signed = new Set(
    cards
      .filter((c) => c.status === "firmata" || c.status === "validata")
      .map((c) => c.judgeId),
  );
  return !(judges.length > 0 && judges.every((j) => signed.has(j.personId)));
}

/**
 * BR-29, caso misto multi-giudice (validato col giudice): se tra le carte
 * CHIUSE della stessa run un giudice ha score_0 o una penalità ≥2 su una
 * manovra dove un altro non ce l'ha → review SEMPRE — né maggioranza né
 * prevalenza. La nota di sistema riporta i valori discordanti PER GIUDICE:
 * al drag il confronto parte già informato. Origine "sistema", distinta
 * dalla hold manuale del giudice.
 */
async function maybeTriggerMixedReview(
  tx: DbOrTx,
  runCtx: NonNullable<Awaited<ReturnType<typeof loadRunContext>>>,
) {
  const [run] = await tx
    .select()
    .from(schema.runs)
    .where(eq(schema.runs.id, runCtx.run.id));
  if (!run || run.reviewHeldAt !== null) return; // già in review: resta com'è
  const cards = await tx
    .select({
      card: schema.scoreCards,
      judgeName: schema.persons.fullName,
    })
    .from(schema.scoreCards)
    .innerJoin(schema.persons, eq(schema.persons.id, schema.scoreCards.judgeId))
    .where(eq(schema.scoreCards.runId, run.id));
  const closed = cards.filter((c) =>
    ["chiusa", "firmata", "validata"].includes(c.card.status),
  );
  if (closed.length < 2) return;

  let position: number | null = null;
  let note: string | null = null;

  // Discordanza sull'esito: un giudice dà score_0 (o no_score) e altri no.
  const withSpecial = closed.filter((c) => c.card.special !== null);
  if (withSpecial.length > 0 && withSpecial.length < closed.length) {
    const others = closed.filter((c) => c.card.special === null);
    note = `${withSpecial
      .map((c) => `${c.judgeName}: ${c.card.special}`)
      .join(" · ")} · ${others.map((c) => c.judgeName).join("/")}: score`;
  } else {
    // Discordanza per manovra: penalità ≥2 da un giudice, non dagli altri.
    const scoresByCard = new Map<string, Map<number, number>>();
    for (const c of closed) {
      const rows = await tx
        .select({
          position: schema.patternManeuvers.position,
          penalty: schema.maneuverScores.penalty,
        })
        .from(schema.maneuverScores)
        .innerJoin(
          schema.patternManeuvers,
          eq(schema.patternManeuvers.id, schema.maneuverScores.maneuverId),
        )
        .where(eq(schema.maneuverScores.scoreCardId, c.card.id));
      scoresByCard.set(
        c.card.id,
        new Map(rows.map((r) => [r.position, Number(r.penalty)])),
      );
    }
    const positions = [
      ...new Set(
        [...scoresByCard.values()].flatMap((m) => [...m.keys()]),
      ),
    ].sort((a, b) => a - b);
    for (const pos of positions) {
      const heavy = closed.filter(
        (c) => (scoresByCard.get(c.card.id)?.get(pos) ?? 0) >= 2,
      );
      if (heavy.length > 0 && heavy.length < closed.length) {
        const light = closed.filter(
          (c) => (scoresByCard.get(c.card.id)?.get(pos) ?? 0) < 2,
        );
        position = pos;
        note = `Manovra ${pos} — ${heavy
          .map(
            (c) =>
              `${c.judgeName}: penalità ${scoresByCard.get(c.card.id)!.get(pos)}`,
          )
          .join(" · ")} · ${light
          .map((c) => {
            const p = scoresByCard.get(c.card.id)?.get(pos) ?? 0;
            return `${c.judgeName}: ${p > 0 ? `penalità ${p}` : "nessuna"}`;
          })
          .join(" · ")}`;
        break; // la prima manovra discordante innesca; le altre si vedono al drag
      }
    }
  }

  if (note === null) return;
  await tx
    .update(schema.runs)
    .set({
      reviewHeldAt: new Date(),
      reviewNote: note,
      reviewPosition: position,
      reviewSource: "sistema",
    })
    .where(eq(schema.runs.id, run.id));
  await recordAudit(tx, {
    actorUserId: null,
    action: "run.review.system",
    entityType: "run",
    entityId: run.id,
    note,
  });
}

/** La run passa a in_attesa_firma quando tutti i giudici attivi hanno chiuso. */
async function maybeAwaitSignature(
  tx: DbOrTx,
  runCtx: NonNullable<Awaited<ReturnType<typeof loadRunContext>>>,
) {
  const relevant = await relevantJudges(tx, runCtx);
  if (relevant.length === 0) return;
  const cards = await tx
    .select()
    .from(schema.scoreCards)
    .where(eq(schema.scoreCards.runId, runCtx.run.id));
  const closed = new Set(
    cards
      .filter((c) => c.status !== "in_compilazione")
      .map((c) => c.judgeId),
  );
  if (relevant.every((j) => closed.has(j.personId))) {
    const [fresh] = await tx
      .select()
      .from(schema.runs)
      .where(eq(schema.runs.id, runCtx.run.id));
    await advanceRun(tx, fresh!, "in_attesa_firma");
  }
}

export const scoringRouter = router({
  /**
   * Le run di una classe per il back-office (validazione BR-27): id, stato,
   * binomio, ordine. La classifica resta un derivato (live.classRanking);
   * qui serve l'aggancio operativo run → carte → valida.
   */
  runsByClass: verifiedProcedure
    .input(z.object({ classId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [cls] = await ctx.db
        .select()
        .from(schema.classes)
        .where(eq(schema.classes.id, input.classId));
      if (!cls) throw new TRPCError({ code: "NOT_FOUND" });
      const [event] = await ctx.db
        .select()
        .from(schema.events)
        .where(eq(schema.events.id, cls.eventId));
      if (
        !can(ctx.actor, "event.registry.manage", {
          organizationId: event!.organizationId,
          eventId: event!.id,
        })
      ) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return ctx.db
        .select({
          runId: schema.runs.id,
          status: schema.runs.status,
          goRound: schema.runs.goRound,
          reviewHeldAt: schema.runs.reviewHeldAt,
          reviewNote: schema.runs.reviewNote,
          reviewPosition: schema.runs.reviewPosition,
          reviewSource: schema.runs.reviewSource,
          entryId: schema.entries.id,
          entryStatus: schema.entries.status,
          drawNumber: schema.entries.drawNumber,
          horseName: schema.horses.name,
          riderName: schema.persons.fullName,
        })
        .from(schema.runs)
        .innerJoin(schema.entries, eq(schema.entries.id, schema.runs.entryId))
        .innerJoin(schema.horses, eq(schema.horses.id, schema.entries.horseId))
        .innerJoin(schema.persons, eq(schema.persons.id, schema.entries.riderId))
        .where(eq(schema.entries.classId, input.classId))
        .orderBy(asc(schema.entries.drawNumber));
    }),

  /** Bundle offline: tutto ciò che serve a lavorare un'intera classe senza rete. */
  bundle: publicProcedure
    .input(z.object({ eventId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const allowed =
        (ctx.actor.kind === "invite" && ctx.actor.eventId === input.eventId) ||
        (ctx.actor.kind === "user" &&
          (await (async () => {
            const [event] = await ctx.db
              .select()
              .from(schema.events)
              .where(eq(schema.events.id, input.eventId));
            return (
              event &&
              can(ctx.actor, "event.registry.manage", {
                organizationId: event.organizationId,
                eventId: input.eventId,
              })
            );
          })()));
      if (!allowed) throw new TRPCError({ code: "FORBIDDEN" });

      const [event] = await ctx.db
        .select()
        .from(schema.events)
        .where(eq(schema.events.id, input.eventId));
      if (!event) throw new TRPCError({ code: "NOT_FOUND" });

      const classes = await ctx.db
        .select()
        .from(schema.classes)
        .where(eq(schema.classes.eventId, input.eventId));
      const patternIds = [...new Set(classes.map((c) => c.patternId))];
      const patterns = patternIds.length
        ? await ctx.db
            .select()
            .from(schema.patterns)
            .where(inArray(schema.patterns.id, patternIds))
        : [];
      const maneuvers = patternIds.length
        ? await ctx.db
            .select()
            .from(schema.patternManeuvers)
            .where(inArray(schema.patternManeuvers.patternId, patternIds))
            .orderBy(asc(schema.patternManeuvers.position))
        : [];
      const classIds = classes.map((c) => c.id);
      const entries = classIds.length
        ? await ctx.db
            .select()
            .from(schema.entries)
            .where(inArray(schema.entries.classId, classIds))
        : [];
      const runs = entries.length
        ? await ctx.db
            .select()
            .from(schema.runs)
            .where(
              inArray(
                schema.runs.entryId,
                entries.map((e) => e.id),
              ),
            )
        : [];
      // Giudici assegnati (id + nome): la card ha bisogno di judge_id — lo
      // scribe sceglie il giudice attivo (BR "uno scribe per più giudici").
      const judges = await ctx.db
        .select({
          personId: schema.eventRoleAssignments.personId,
          fullName: schema.persons.fullName,
          classId: schema.eventRoleAssignments.classId,
        })
        .from(schema.eventRoleAssignments)
        .innerJoin(
          schema.persons,
          eq(schema.persons.id, schema.eventRoleAssignments.personId),
        )
        .where(
          and(
            eq(schema.eventRoleAssignments.eventId, input.eventId),
            eq(schema.eventRoleAssignments.role, "giudice"),
            isNull(schema.eventRoleAssignments.deactivatedAt),
          ),
        );
      // Nomi binomio: l'app scribe è offline, i nomi devono stare nel bundle.
      const horseIds = [...new Set(entries.map((e) => e.horseId))];
      const riderIds = [...new Set(entries.map((e) => e.riderId))];
      const horseRows = horseIds.length
        ? await ctx.db
            .select({ id: schema.horses.id, name: schema.horses.name })
            .from(schema.horses)
            .where(inArray(schema.horses.id, horseIds))
        : [];
      const riderRows = riderIds.length
        ? await ctx.db
            .select({ id: schema.persons.id, name: schema.persons.fullName })
            .from(schema.persons)
            .where(inArray(schema.persons.id, riderIds))
        : [];
      return {
        engineVersion: SCORING_ENGINE_VERSION,
        // BR-27/51: il device conosce i confini di drag (posizioni fisse)
        // per proporre la firma del blocco al drag.
        dragEveryNRuns: event.dragEveryNRuns,
        // se la sessione è un giudice, è il giudice attivo predefinito
        selfJudgePersonId:
          ctx.actor.kind === "invite" && ctx.actor.role === "giudice"
            ? ctx.actor.personId
            : null,
        classes,
        patterns,
        maneuvers,
        entries,
        runs,
        judges,
        horses: Object.fromEntries(horseRows.map((h) => [h.id, h.name])),
        riders: Object.fromEntries(riderRows.map((r) => [r.id, r.name])),
      };
    }),

  /** Sync batch, esito per singolo item: retry e fuori ordine sono sicuri. */
  sync: publicProcedure
    .input(
      z.object({
        engineVersion: z.string(),
        cards: z.array(syncCardInput).max(200),
        events: z.array(syncEventInput).max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (
        ctx.actor.kind !== "invite" ||
        !["giudice", "scribe"].includes(ctx.actor.role)
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "La sync scoring richiede una sessione giudice/scribe",
        });
      }
      const actorEventId = ctx.actor.eventId;
      const now = new Date();

      const eventResults: Array<{ clientEventId: string; result: string }> = [];
      for (const e of input.events) {
        const runCtx = await loadRunContext(ctx.db, e.runId);
        if (!runCtx || runCtx.event.id !== actorEventId) {
          eventResults.push({ clientEventId: e.clientEventId, result: "rejected" });
          continue;
        }
        const at = new Date(e.at);
        const deviceTime =
          at.getTime() - now.getTime() > CLOCK_SKEW_TOLERANCE_MS ? now : at;
        if (e.type === "sent_to_field") {
          const advanced = await advanceRun(ctx.db, runCtx.run, "in_inserimento", {
            startedAt: runCtx.run.startedAt ?? deviceTime,
          });
          eventResults.push({
            clientEventId: e.clientEventId,
            result: advanced ? "applied" : "duplicate",
          });
        } else if (e.type === "held_for_review") {
          // BR-29: la run è "in review"; il numero non c'è ancora, lo show va.
          // Origine GIUDICE (dubbio dichiarato), con la manovra indicata.
          await ctx.db
            .update(schema.runs)
            .set({
              reviewHeldAt: runCtx.run.reviewHeldAt ?? now,
              reviewNote: e.note ?? runCtx.run.reviewNote,
              reviewPosition: e.position ?? runCtx.run.reviewPosition,
              reviewSource: runCtx.run.reviewSource ?? "giudice",
            })
            .where(eq(schema.runs.id, e.runId));
          eventResults.push({
            clientEventId: e.clientEventId,
            result: runCtx.run.reviewHeldAt ? "duplicate" : "applied",
          });
        } else {
          // reopened: solo pre-firma, solo dalla sessione titolare (scoped
          // allo stesso evento; la carta firmata resta immutabile).
          const [card] = e.note
            ? await ctx.db
                .select()
                .from(schema.scoreCards)
                .where(eq(schema.scoreCards.clientCardId, e.note))
            : [];
          if (!card || card.status === "firmata" || card.status === "validata") {
            eventResults.push({
              clientEventId: e.clientEventId,
              result: card ? "rejected_immutable" : "rejected",
            });
            continue;
          }
          await ctx.db.transaction(async (tx) => {
            await tx
              .update(schema.scoreCards)
              .set({ status: "in_compilazione" })
              .where(eq(schema.scoreCards.id, card.id));
            await recordAudit(tx, {
              actorUserId: null,
              action: "scorecard.reopened",
              entityType: "score_card",
              entityId: card.id,
              note: `Riapertura pre-firma dalla sessione ${ctx.actor.kind === "invite" ? ctx.actor.role : ""} (run ${e.runId})`,
            });
          });
          eventResults.push({ clientEventId: e.clientEventId, result: "applied" });
        }
      }

      const cardResults: Array<{
        clientCardId: string;
        result: string;
        serverTotal?: number | null;
        message?: string;
      }> = [];
      for (const c of input.cards) {
        try {
          const result = await ctx.db.transaction(async (tx) => {
            const runCtx = await loadRunContext(tx, c.runId);
            if (!runCtx || runCtx.event.id !== actorEventId) {
              return { clientCardId: c.clientCardId, result: "rejected" };
            }
            // il giudice della carta dev'essere assegnato attivo sull'evento
            const [assignment] = await tx
              .select()
              .from(schema.eventRoleAssignments)
              .where(
                and(
                  eq(schema.eventRoleAssignments.eventId, actorEventId),
                  eq(schema.eventRoleAssignments.personId, c.judgeId),
                  eq(schema.eventRoleAssignments.role, "giudice"),
                  isNull(schema.eventRoleAssignments.deactivatedAt),
                ),
              );
            if (!assignment) {
              return {
                clientCardId: c.clientCardId,
                result: "rejected",
                message: "Giudice non assegnato all'evento",
              };
            }

            const breakdown = computeCardScore(toCardInput(c), {
              requireComplete: true,
              expectedManeuvers: c.maneuvers.length,
            });
            const serverTotal = breakdown.total;
            const mismatch = c.displayedTotal !== serverTotal;
            // Osservabilità: motore diverso ma totale uguale → nessun blocco,
            // solo annotazione (si vuole sapere di un device vecchio PRIMA
            // che produca un mismatch vero).
            const versionSkew =
              !mismatch && c.engineVersion !== SCORING_ENGINE_VERSION;

            const [existing] = await tx
              .select()
              .from(schema.scoreCards)
              .where(eq(schema.scoreCards.clientCardId, c.clientCardId));

            if (existing) {
              if (existing.status === "firmata" || existing.status === "validata") {
                const sameSignature =
                  c.status === "firmata" &&
                  existing.signedAt?.toISOString() ===
                    (c.signedAt ? new Date(c.signedAt).toISOString() : null);
                return {
                  clientCardId: c.clientCardId,
                  result: sameSignature ? "duplicate" : "conflict_immutable",
                  serverTotal,
                };
              }
              // update (richiusura dopo riapertura, oppure arrivo della firma)
              await replaceManeuverScores(
                tx,
                existing.id,
                runCtx.cls.patternId,
                c.maneuvers,
              );
              await tx
                .update(schema.scoreCards)
                .set({
                  runPenalty: String(c.runPenalty),
                  special: c.special,
                  status: c.status,
                  closedAt: new Date(c.closedAt),
                  engineVersion: c.engineVersion,
                  engineMismatch: mismatch,
                  signedAt: c.signedAt ? new Date(c.signedAt) : null,
                  signatureStroke: c.signatureStroke,
                  serverReceivedAt: now,
                })
                .where(eq(schema.scoreCards.id, existing.id));
              if (mismatch) await auditMismatch(tx, existing.id, c, serverTotal);
              if (versionSkew) await auditVersionSkew(tx, existing.id, c);
              await maybeTriggerMixedReview(tx, runCtx);
              await maybeAwaitSignature(tx, runCtx);
              return {
                clientCardId: c.clientCardId,
                result: "applied",
                serverTotal,
              };
            }

            // slot (run, giudice) già occupato da un'ALTRA carta → conflitto
            const [slot] = await tx
              .select()
              .from(schema.scoreCards)
              .where(
                and(
                  eq(schema.scoreCards.runId, c.runId),
                  eq(schema.scoreCards.judgeId, c.judgeId),
                ),
              );
            if (slot) {
              // mai sovrascrittura silenziosa: il payload resta agli atti
              await recordAudit(tx, {
                actorUserId: null,
                action: "scorecard.sync_conflict",
                entityType: "score_card",
                entityId: slot.id,
                after: c,
                note: `Seconda carta (${c.clientCardId}) per la stessa run e giudice: richiede decisione dell'organizzatore (BR-40)`,
              });
              return {
                clientCardId: c.clientCardId,
                result: "conflict",
                serverTotal,
              };
            }

            const skewed =
              c.signedAt &&
              new Date(c.signedAt).getTime() - now.getTime() >
                CLOCK_SKEW_TOLERANCE_MS;
            const [created] = await tx
              .insert(schema.scoreCards)
              .values({
                runId: c.runId,
                judgeId: c.judgeId,
                runPenalty: String(c.runPenalty),
                special: c.special,
                status: c.status,
                clientCardId: c.clientCardId,
                source: "digital",
                engineVersion: c.engineVersion,
                engineMismatch: mismatch,
                closedAt: new Date(c.closedAt),
                signedAt: c.signedAt ? new Date(c.signedAt) : null,
                signatureStroke: c.signatureStroke,
                serverReceivedAt: now,
              })
              .returning();
            await replaceManeuverScores(
              tx,
              created!.id,
              runCtx.cls.patternId,
              c.maneuvers,
            );
            if (mismatch) await auditMismatch(tx, created!.id, c, serverTotal);
            if (versionSkew) await auditVersionSkew(tx, created!.id, c);
            if (skewed) {
              await recordAudit(tx, {
                actorUserId: null,
                action: "scorecard.clock_skew",
                entityType: "score_card",
                entityId: created!.id,
                note: `signed_at del device nel futuro del server: ${c.signedAt}`,
              });
            }
            await maybeTriggerMixedReview(tx, runCtx);
            await maybeAwaitSignature(tx, runCtx);
            return {
              clientCardId: c.clientCardId,
              result: "applied",
              serverTotal,
            };
          });
          cardResults.push(result);
        } catch (err) {
          cardResults.push({
            clientCardId: c.clientCardId,
            result: "rejected",
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
      if (
        cardResults.some((r) => r.result === "applied") ||
        eventResults.some((r) => r.result === "applied")
      ) {
        liveBus.tick(actorEventId, "scoring.sync");
      }
      return { cards: cardResults, events: eventResults };
    }),

  /** BR-28: backfill della carta cartacea. Firma digitale mai simulata. */
  backfill: verifiedProcedure
    .input(
      z.object({
        runId: z.string().uuid(),
        judgePersonId: z.string().uuid(),
        maneuvers: z.array(maneuverInput).min(1).max(10),
        runPenalty: z.number(),
        special: z.enum(["score_0", "no_score"]).nullable(),
        paperRef: z.string().min(1).max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const runCtx = await loadRunContext(ctx.db, input.runId);
      if (!runCtx) throw new TRPCError({ code: "NOT_FOUND" });
      if (
        !can(ctx.actor, "score.backfill", {
          organizationId: runCtx.event.organizationId,
          eventId: runCtx.event.id,
        })
      ) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      let breakdown;
      try {
        breakdown = computeCardScore(toCardInput(input), {
          requireComplete: true,
          expectedManeuvers: input.maneuvers.length,
        });
      } catch (err) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: err instanceof Error ? err.message : String(err),
        });
      }
      const actorUserId = ctx.actor.userId;
      const cardId = await ctx.db.transaction(async (tx) => {
        let created;
        try {
          [created] = await tx
            .insert(schema.scoreCards)
            .values({
              runId: input.runId,
              judgeId: input.judgePersonId,
              runPenalty: String(input.runPenalty),
              special: input.special,
              // ufficializzata dalla carta cartacea firmata agli atti:
              // nessun signed_at, nessun tratto — la firma non si simula.
              status: "firmata",
              source: "manual_backfill",
              paperRef: input.paperRef,
              engineVersion: SCORING_ENGINE_VERSION,
              closedAt: new Date(),
              serverReceivedAt: new Date(),
            })
            .returning();
        } catch (err) {
          for (let e: unknown = err; e instanceof Error; e = e.cause) {
            if (e.message.includes("score_cards_run_judge")) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Esiste già una carta per questa run e giudice",
              });
            }
          }
          throw err;
        }
        await replaceManeuverScores(
          tx,
          created!.id,
          runCtx.cls.patternId,
          input.maneuvers,
        );
        await recordAudit(tx, {
          actorUserId,
          action: "scorecard.backfill",
          entityType: "score_card",
          entityId: created!.id,
          after: { ...input, total: breakdown.total },
          note: `Backfill da carta cartacea: ${input.paperRef}`,
        });
        await maybeAwaitSignature(tx, runCtx);
        return created!.id;
      });
      return { scoreCardId: cardId, total: breakdown.total };
    }),

  /** BR-40/41: correzione post-firma. Lo snapshot in audit È il versionamento. */
  correct: verifiedProcedure
    .input(
      z.object({
        scoreCardId: z.string().uuid(),
        maneuvers: z.array(maneuverInput).min(1).max(10).optional(),
        runPenalty: z.number().optional(),
        special: z.enum(["score_0", "no_score"]).nullable().optional(),
        reason: z.string().min(1).max(2000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [card] = await ctx.db
        .select()
        .from(schema.scoreCards)
        .where(eq(schema.scoreCards.id, input.scoreCardId));
      if (!card) throw new TRPCError({ code: "NOT_FOUND" });
      const runCtx = await loadRunContext(ctx.db, card.runId);
      if (
        !runCtx ||
        !can(ctx.actor, "score.correct", {
          organizationId: runCtx.event.organizationId,
          eventId: runCtx.event.id,
        })
      ) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      if (card.status !== "firmata" && card.status !== "validata") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "La correzione riguarda le carte firmate; prima della firma si riapre (BR-27)",
        });
      }
      const actorUserId = ctx.actor.userId;
      // BR-41: classifica prima/dopo per notificare chi cambia posizione
      const rankingBefore = await buildClassRanking(ctx.db, runCtx.cls.id);
      await ctx.db.transaction(async (tx) => {
        const beforeScores = await tx
          .select({
            position: schema.patternManeuvers.position,
            quality: schema.maneuverScores.quality,
            penalty: schema.maneuverScores.penalty,
          })
          .from(schema.maneuverScores)
          .innerJoin(
            schema.patternManeuvers,
            eq(schema.patternManeuvers.id, schema.maneuverScores.maneuverId),
          )
          .where(eq(schema.maneuverScores.scoreCardId, card.id))
          .orderBy(asc(schema.patternManeuvers.position));

        const nextManeuvers =
          input.maneuvers ??
          beforeScores.map((m) => ({
            position: m.position,
            quality: Number(m.quality),
            penalty: Number(m.penalty),
          }));
        const nextRunPenalty = input.runPenalty ?? Number(card.runPenalty);
        const nextSpecial =
          input.special !== undefined ? input.special : card.special;
        try {
          computeCardScore(
            {
              maneuvers: nextManeuvers,
              runPenalty: nextRunPenalty,
              special: nextSpecial,
            },
            { requireComplete: true, expectedManeuvers: nextManeuvers.length },
          );
        } catch (err) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: err instanceof Error ? err.message : String(err),
          });
        }

        // prima l'audit con lo snapshot completo, poi la modifica:
        // l'audit immutabile è la versione precedente (BR-40).
        await recordAudit(tx, {
          actorUserId,
          action: "scorecard.correct",
          entityType: "score_card",
          entityId: card.id,
          before: {
            maneuvers: beforeScores,
            runPenalty: card.runPenalty,
            special: card.special,
          },
          after: {
            maneuvers: nextManeuvers,
            runPenalty: nextRunPenalty,
            special: nextSpecial,
          },
          note: input.reason,
        });
        await replaceManeuverScores(
          tx,
          card.id,
          runCtx.cls.patternId,
          nextManeuvers,
        );
        await tx
          .update(schema.scoreCards)
          .set({ runPenalty: String(nextRunPenalty), special: nextSpecial })
          .where(eq(schema.scoreCards.id, card.id));
      });

      // Propagazione BR-41: il ricalcolo è gratis (derivato); si notificano
      // i binomi con posizione cambiata, nella LINGUA DEL DESTINATARIO (BR-62).
      const rankingAfter = await buildClassRanking(ctx.db, runCtx.cls.id);
      const beforePos = new Map(
        rankingBefore.ranking.map((r) => [r.entryId, r.position]),
      );
      const changed = rankingAfter.ranking.filter(
        (r) => r.state === "scored" && beforePos.get(r.entryId) !== r.position,
      );
      const MESSAGES = {
        it: (pos: number | null, className: string) => ({
          subject: "Score corretto — nuova posizione",
          body: `Uno score della classe ${className} è stato corretto: la tua nuova posizione è ${pos ?? "—"}.`,
        }),
        en: (pos: number | null, className: string) => ({
          subject: "Score corrected — new placing",
          body: `A score in class ${className} was corrected: your new placing is ${pos ?? "—"}.`,
        }),
      } as const;
      for (const r of changed) {
        const [rider] = await ctx.db
          .select()
          .from(schema.persons)
          .where(eq(schema.persons.id, r.riderId));
        if (!rider?.email) continue;
        const message = MESSAGES[rider.locale](r.position, runCtx.cls.name);
        const { text, html } = renderMail(rider.locale, {
          heading: message.subject,
          paragraphs: [message.body],
        });
        await ctx.mailer.send({
          to: rider.email,
          subject: message.subject,
          body: text,
          html,
        });
      }
      liveBus.tick(runCtx.event.id, "scorecard.corrected");
      return { corrected: true, positionsChanged: changed.length };
    }),

  /** Storia delle correzioni interrogabile PER CARTA (BR-40). */
  cardHistory: verifiedProcedure
    .input(z.object({ scoreCardId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [card] = await ctx.db
        .select()
        .from(schema.scoreCards)
        .where(eq(schema.scoreCards.id, input.scoreCardId));
      if (!card) throw new TRPCError({ code: "NOT_FOUND" });
      const runCtx = await loadRunContext(ctx.db, card.runId);
      if (
        !runCtx ||
        !can(ctx.actor, "event.registry.manage", {
          organizationId: runCtx.event.organizationId,
          eventId: runCtx.event.id,
        })
      ) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return ctx.db
        .select()
        .from(schema.auditLog)
        .where(
          and(
            eq(schema.auditLog.entityType, "score_card"),
            eq(schema.auditLog.entityId, input.scoreCardId),
          ),
        )
        .orderBy(asc(schema.auditLog.occurredAt));
    }),

  /** Le carte di una run coi totali RICALCOLATI (mai memorizzati) e lo stato review. */
  runCards: verifiedProcedure
    .input(z.object({ runId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const runCtx = await loadRunContext(ctx.db, input.runId);
      if (!runCtx) throw new TRPCError({ code: "NOT_FOUND" });
      if (
        !can(ctx.actor, "event.registry.manage", {
          organizationId: runCtx.event.organizationId,
          eventId: runCtx.event.id,
        })
      ) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const cards = await ctx.db
        .select()
        .from(schema.scoreCards)
        .where(eq(schema.scoreCards.runId, input.runId));
      const result = [];
      for (const card of cards) {
        const scores = await ctx.db
          .select({
            position: schema.patternManeuvers.position,
            quality: schema.maneuverScores.quality,
            penalty: schema.maneuverScores.penalty,
          })
          .from(schema.maneuverScores)
          .innerJoin(
            schema.patternManeuvers,
            eq(schema.patternManeuvers.id, schema.maneuverScores.maneuverId),
          )
          .where(eq(schema.maneuverScores.scoreCardId, card.id))
          .orderBy(asc(schema.patternManeuvers.position));
        const breakdown = computeCardScore({
          maneuvers: scores.map((m) => ({
            position: m.position,
            quality: Number(m.quality),
            penalty: Number(m.penalty),
          })),
          runPenalty: Number(card.runPenalty),
          special: card.special,
        });
        result.push({ card, total: breakdown.total, outcome: breakdown.outcome });
      }
      const judges = await relevantJudges(ctx.db, runCtx);
      return {
        runStatus: runCtx.run.status,
        inReview: isRunInReview(runCtx.run, judges, cards),
        reviewNote: runCtx.run.reviewNote,
        reviewPosition: runCtx.run.reviewPosition,
        reviewSource: runCtx.run.reviewSource,
        cards: result,
      };
    }),

  /**
   * Validazione run-level (gate BR-27/29): richiede TUTTE le carte firmate
   * (la chiusura annuncia, solo la firma ufficializza), nessuna review
   * pendente e nessun mismatch motore non riconosciuto dall'organizzatore.
   */
  validateRun: verifiedProcedure
    .input(
      z.object({
        runId: z.string().uuid(),
        /** riconoscimento esplicito di un mismatch motore (auditato) */
        acknowledgeMismatch: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const runCtx = await loadRunContext(ctx.db, input.runId);
      if (!runCtx) throw new TRPCError({ code: "NOT_FOUND" });
      if (
        !can(ctx.actor, "results.validate", {
          organizationId: runCtx.event.organizationId,
          eventId: runCtx.event.id,
        })
      ) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const actorUserId = ctx.actor.userId;
      await ctx.db.transaction(async (tx) => {
        const judges = await relevantJudges(tx, runCtx);
        const cards = await tx
          .select()
          .from(schema.scoreCards)
          .where(eq(schema.scoreCards.runId, input.runId));
        const signed = new Set(
          cards
            .filter((c) => c.status === "firmata" || c.status === "validata")
            .map((c) => c.judgeId),
        );
        if (judges.length === 0 || !judges.every((j) => signed.has(j.personId))) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "La validazione richiede la firma di tutte le carte (BR-27): la chiusura annuncia, la firma ufficializza",
          });
        }
        if (isRunInReview(runCtx.run, judges, cards)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Score in review (BR-29): risolvi prima la revisione",
          });
        }
        const mismatched = cards.filter((c) => c.engineMismatch);
        if (mismatched.length > 0 && !input.acknowledgeMismatch) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Mismatch motore su una carta: verifica e riconosci esplicitamente (mai silenzioso)",
          });
        }
        if (mismatched.length > 0) {
          for (const c of mismatched) {
            await recordAudit(tx, {
              actorUserId,
              action: "scorecard.mismatch_acknowledged",
              entityType: "score_card",
              entityId: c.id,
              note: "L'organizzatore ha verificato e riconosciuto il mismatch motore",
            });
          }
        }
        await tx
          .update(schema.scoreCards)
          .set({ status: "validata" })
          .where(
            inArray(
              schema.scoreCards.id,
              cards.map((c) => c.id),
            ),
          );
        const [fresh] = await tx
          .select()
          .from(schema.runs)
          .where(eq(schema.runs.id, input.runId));
        await advanceRun(tx, fresh!, "validata");
      });
      liveBus.tick(runCtx.event.id, "run.validated");
      return { validated: true };
    }),

  /**
   * Pubblicazione di classe (flusso G): valida ciò che passa i gate e porta
   * le run a `pubblicata`. Le run non pronte NON bloccano: avviso e la
   * classifica resta marcata provvisoria per quelle righe.
   */
  publishClass: verifiedProcedure
    .input(z.object({ classId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [cls] = await ctx.db
        .select()
        .from(schema.classes)
        .where(eq(schema.classes.id, input.classId));
      if (!cls) throw new TRPCError({ code: "NOT_FOUND" });
      const [event] = await ctx.db
        .select()
        .from(schema.events)
        .where(eq(schema.events.id, cls.eventId));
      if (
        !can(ctx.actor, "results.validate", {
          organizationId: event!.organizationId,
          eventId: event!.id,
        })
      ) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const entries = await ctx.db
        .select()
        .from(schema.entries)
        .where(eq(schema.entries.classId, input.classId));
      const runs = entries.length
        ? await ctx.db
            .select()
            .from(schema.runs)
            .where(
              inArray(
                schema.runs.entryId,
                entries.map((e) => e.id),
              ),
            )
        : [];
      let published = 0;
      const warnings: string[] = [];
      for (const run of runs) {
        if (run.status === "pubblicata") continue;
        if (["attesa", "in_inserimento"].includes(run.status)) {
          warnings.push(`Run ${run.id}: non ancora completata`);
          continue;
        }
        await ctx.db.transaction(async (tx) => {
          const cards = await tx
            .select()
            .from(schema.scoreCards)
            .where(eq(schema.scoreCards.runId, run.id));
          const runCtx = await loadRunContext(tx, run.id);
          const judges = await relevantJudges(tx, runCtx!);
          const signed = new Set(
            cards
              .filter((c) => c.status === "firmata" || c.status === "validata")
              .map((c) => c.judgeId),
          );
          if (
            judges.length === 0 ||
            !judges.every((j) => signed.has(j.personId))
          ) {
            warnings.push(`Run ${run.id}: carte non tutte firmate`);
            return;
          }
          if (isRunInReview(runCtx!.run, judges, cards)) {
            warnings.push(`Run ${run.id}: score in review`);
            return;
          }
          if (cards.some((c) => c.engineMismatch)) {
            warnings.push(`Run ${run.id}: mismatch motore da riconoscere`);
            return;
          }
          await tx
            .update(schema.scoreCards)
            .set({ status: "validata" })
            .where(
              inArray(
                schema.scoreCards.id,
                cards.map((c) => c.id),
              ),
            );
          const [fresh] = await tx
            .select()
            .from(schema.runs)
            .where(eq(schema.runs.id, run.id));
          await advanceRun(tx, fresh!, "pubblicata");
          published += 1;
        });
      }
      liveBus.tick(event!.id, "class.published");
      return { published, warnings };
    }),
});

async function auditVersionSkew(
  tx: DbOrTx,
  scoreCardId: string,
  payload: { engineVersion: string },
) {
  await recordAudit(tx, {
    actorUserId: null,
    action: "scorecard.engine_version_skew",
    entityType: "score_card",
    entityId: scoreCardId,
    before: { clientEngine: payload.engineVersion },
    after: { serverEngine: SCORING_ENGINE_VERSION },
    note: "Motore client diverso dal server ma totale coincidente: nessun blocco, sola osservabilità",
  });
}

async function auditMismatch(
  tx: DbOrTx,
  scoreCardId: string,
  payload: { displayedTotal: number | null; engineVersion: string },
  serverTotal: number | null,
) {
  await recordAudit(tx, {
    actorUserId: null,
    action: "scorecard.engine_mismatch",
    entityType: "score_card",
    entityId: scoreCardId,
    before: {
      displayedTotal: payload.displayedTotal,
      clientEngine: payload.engineVersion,
    },
    after: { serverTotal, serverEngine: SCORING_ENGINE_VERSION },
    note: "Totale mostrato alla firma diverso dal ricalcolo server: esclusa dall'auto-validazione finché l'organizzatore non decide",
  });
}
