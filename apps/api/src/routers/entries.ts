import { TRPCError } from "@trpc/server";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { schema, type Db } from "@penrunner/db";
import { personDisplayNameSql } from "../services/names.js";
import { selfServeEntriesClosed } from "../services/cutoff.js";
import { recordAudit } from "../services/audit.js";
import { renderMail } from "../services/mailtemplate.js";
import { warnLine } from "../services/warncopy.js";
import { evaluateEligibility, type EligibilityWarning } from "../eligibility.js";
import { can, type Actor } from "../policy/policy.js";
import { liveBus } from "../services/livebus.js";
import { router, verifiedProcedure } from "../trpc.js";

// ---------------------------------------------------------------------------
// Iscrizione singola e massiva (flusso C). Gli avvisi di eleggibilità non
// bloccano MAI (BR-18): bloccanti sono solo integrità (BR-11, unique in DB),
// capienza classe e stato evento. La fee è sempre derivata (BR-01/02).
// ---------------------------------------------------------------------------

type DbOrTx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

const entryInput = z.object({
  classId: z.string().uuid(),
  horseId: z.string().uuid(),
  riderId: z.string().uuid(),
  tecnicoName: z.string().max(200).optional(),
});

async function loadClassContext(db: DbOrTx, classId: string) {
  const [row] = await db
    .select({
      cls: schema.classes,
      event: schema.events,
      category: schema.categories,
    })
    .from(schema.classes)
    .innerJoin(schema.events, eq(schema.events.id, schema.classes.eventId))
    .innerJoin(
      schema.categories,
      eq(schema.categories.id, schema.classes.categoryId),
    )
    .where(eq(schema.classes.id, classId));
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Classe inesistente" });
  return row;
}

function guardRegistrationsOpen(event: typeof schema.events.$inferSelect) {
  if (event.status !== "iscrizioni_aperte") {
    // Le late entry sono una concessione manuale dell'organizzatore (flusso C).
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Le iscrizioni per questo evento non sono aperte",
    });
  }
  // BR-90: dal cut-off della vigilia il self-serve chiude — si passa dalla
  // segreteria (l'organizzatore inserisce sempre, via regia). Lo scratch
  // self-serve NON è toccato: resta BR-17, fino al proprio turno.
  if (selfServeEntriesClosed(event)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Le iscrizioni online per questo evento hanno chiuso alle ${event.entryChangeCutoff} del giorno prima: contatta la segreteria dello show`,
    });
  }
}

/** Capienza (vincolo di integrità/capienza, non eleggibilità: BR-18 non c'entra). */
async function guardClassCapacity(
  db: DbOrTx,
  cls: typeof schema.classes.$inferSelect,
) {
  if (cls.maxEntries === null) return;
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.entries)
    .where(
      and(
        eq(schema.entries.classId, cls.id),
        ne(schema.entries.status, "ritirata"),
        ne(schema.entries.status, "assente"),
      ),
    );
  if ((row?.count ?? 0) >= cls.maxEntries) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Classe al completo" });
  }
}

async function computeWarnings(
  db: DbOrTx,
  categoryId: string,
  riderId: string,
  horseId: string,
  tecnicoName: string | null,
  eventYear: number,
): Promise<EligibilityWarning[]> {
  const [category] = await db
    .select()
    .from(schema.categories)
    .where(eq(schema.categories.id, categoryId));
  const [rider] = await db
    .select()
    .from(schema.persons)
    .where(eq(schema.persons.id, riderId));
  const [horse] = await db
    .select()
    .from(schema.horses)
    .where(eq(schema.horses.id, horseId));
  if (!category || !rider || !horse) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Binomio o categoria inesistenti" });
  }
  return evaluateEligibility(
    category,
    {
      personId: rider.id,
      membershipIrha: rider.membershipIrha,
      membershipFise: rider.membershipFise,
      birthDate: rider.birthDate,
    },
    { ownerId: horse.ownerId },
    { tecnicoName },
    eventYear,
  );
}

/** Titolarità del binomio: cavaliere, proprietario o scuderia (referente). */
async function canManageEntry(
  db: DbOrTx,
  actor: Actor,
  entry: typeof schema.entries.$inferSelect,
): Promise<boolean> {
  if (actor.kind !== "user" || !actor.personId) return false;
  if (actor.personId === entry.riderId) return true;
  const [horse] = await db
    .select()
    .from(schema.horses)
    .where(eq(schema.horses.id, entry.horseId));
  if (!horse) return false;
  if (actor.personId === horse.ownerId) return true;
  return (
    horse.stableId !== null && actor.referentOfStableIds.includes(horse.stableId)
  );
}

/**
 * PR-0 qualità (tocca denaro): il duplicato si intercetta PRIMA dell'insert,
 * con un errore che NOMINA il binomio e la classe — "quale cavallo, dove".
 * Dentro la stessa transazione vede anche gli insert del batch corrente
 * (duplicato nella stessa griglia). Il catch sul vincolo resta come backstop
 * per la corsa concorrente (dove la tx è ormai abortita e non si può fare
 * la SELECT dei nomi).
 */
async function guardDuplicatePair(
  tx: DbOrTx,
  cls: { id: string; name: string },
  horseId: string,
): Promise<void> {
  const [dup] = await tx
    .select({ status: schema.entries.status })
    .from(schema.entries)
    .where(
      and(
        eq(schema.entries.classId, cls.id),
        eq(schema.entries.horseId, horseId),
      ),
    );
  if (!dup) return;
  const [horse] = await tx
    .select({ name: schema.horses.name })
    .from(schema.horses)
    .where(eq(schema.horses.id, horseId));
  const name = horse?.name ?? "Il cavallo";
  throw new TRPCError({
    code: "BAD_REQUEST",
    message:
      dup.status === "ritirata" || dup.status === "assente"
        ? `«${name}» risulta già iscritto a «${cls.name}» e poi ritirato: per rientrare parla con la segreteria dello show`
        : `«${name}» è già iscritto a «${cls.name}»`,
  });
}

async function insertEntry(
  tx: DbOrTx,
  input: z.infer<typeof entryInput>,
): Promise<typeof schema.entries.$inferSelect> {
  try {
    const [entry] = await tx
      .insert(schema.entries)
      .values({
        classId: input.classId,
        horseId: input.horseId,
        riderId: input.riderId,
        tecnicoName: input.tecnicoName ?? null,
      })
      .returning();
    return entry!;
  } catch (err) {
    for (let e: unknown = err; e instanceof Error; e = e.cause) {
      if (e.message.includes("entries_class_horse")) {
        // BR-11: vincolo di integrità, questo sì bloccante.
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Questo cavallo è già iscritto a questa classe",
        });
      }
    }
    throw err;
  }
}

/** Il riepilogo costi del prototipo: costo classi + fee × cavalli distinti. */
async function quoteForEntries(
  db: DbOrTx,
  entryIds: string[],
): Promise<{
  horses: number;
  enrollments: number;
  classesCost: number;
  fee: number;
  total: number;
}> {
  if (entryIds.length === 0) {
    return { horses: 0, enrollments: 0, classesCost: 0, fee: 0, total: 0 };
  }
  const rows = await db
    .select({
      horseId: schema.entries.horseId,
      entryFee: schema.classes.entryFee,
      feePerHorse: schema.events.feePerHorse,
    })
    .from(schema.entries)
    .innerJoin(schema.classes, eq(schema.classes.id, schema.entries.classId))
    .innerJoin(schema.events, eq(schema.events.id, schema.classes.eventId))
    .where(inArray(schema.entries.id, entryIds));
  const horses = new Set(rows.map((r) => r.horseId)).size;
  const classesCost = rows.reduce((s, r) => s + Number(r.entryFee), 0);
  // BR-01: fee per cavallo distinto, non per iscrizione.
  const fee = horses * Number(rows[0]?.feePerHorse ?? 0);
  return {
    horses,
    enrollments: rows.length,
    classesCost,
    fee,
    total: classesCost + fee,
  };
}

export const entriesRouter = router({
  /** Iscrizione individuale (concorrente: proprio binomio). */
  create: verifiedProcedure.input(entryInput).mutation(async ({ ctx, input }) => {
    const { cls, event, category } = await loadClassContext(ctx.db, input.classId);
    const [horse] = await ctx.db
      .select()
      .from(schema.horses)
      .where(eq(schema.horses.id, input.horseId));
    if (!horse) throw new TRPCError({ code: "NOT_FOUND" });
    const own =
      can(ctx.actor, "entries.own", { personId: input.riderId }) ||
      can(ctx.actor, "entries.own", { personId: horse.ownerId });
    if (!own) throw new TRPCError({ code: "FORBIDDEN" });

    guardRegistrationsOpen(event);
    await guardClassCapacity(ctx.db, cls);
    await guardDuplicatePair(ctx.db, cls, input.horseId);
    const entry = await insertEntry(ctx.db, input);
    const warnings = await computeWarnings(
      ctx.db,
      category.id,
      input.riderId,
      input.horseId,
      entry.tecnicoName,
      new Date(event.startDate).getFullYear(),
    );
    return { entryId: entry.id, status: entry.status, warnings };
  }),

  /** Iscrizione massiva scuderia: transazione tutto-o-niente + riepilogo costi. */
  bulkCreate: verifiedProcedure
    .input(
      z.object({
        stableId: z.string().uuid(),
        items: z.array(entryInput).min(1).max(200),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!can(ctx.actor, "entries.bulk", { stableId: input.stableId })) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const created = await ctx.db.transaction(async (tx) => {
        const created: Array<{
          entryId: string;
          classId: string;
          warnings: EligibilityWarning[];
        }> = [];
        let eventId: string | undefined;
        for (const item of input.items) {
          const { cls, event, category } = await loadClassContext(tx, item.classId);
          if (eventId === undefined) eventId = event.id;
          else if (eventId !== event.id) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Un'iscrizione massiva riguarda un solo evento",
            });
          }
          guardRegistrationsOpen(event);
          await guardClassCapacity(tx, cls);
          await guardDuplicatePair(tx, cls, item.horseId);
          const entry = await insertEntry(tx, item);
          const warnings = await computeWarnings(
            tx,
            category.id,
            item.riderId,
            item.horseId,
            entry.tecnicoName,
            new Date(event.startDate).getFullYear(),
          );
          created.push({ entryId: entry.id, classId: cls.id, warnings });
        }
        return created;
      });
      const quote = await quoteForEntries(
        ctx.db,
        created.map((c) => c.entryId),
      );
      return { entries: created, quote };
    }),

  /**
   * Conferma: bozza → confermata. Gli avvisi vengono fotografati
   * sull'iscrizione come traccia permanente (BR-18) — non bloccano.
   * Da qui la fee del cavallo matura ed è dovuta (BR-03).
   */
  confirm: verifiedProcedure
    .input(z.object({ entryIds: z.array(z.string().uuid()).min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.transaction(async (tx) => {
        for (const entryId of input.entryIds) {
          const [entry] = await tx
            .select()
            .from(schema.entries)
            .where(eq(schema.entries.id, entryId));
          if (!entry) throw new TRPCError({ code: "NOT_FOUND" });
          if (!(await canManageEntry(tx, ctx.actor, entry))) {
            throw new TRPCError({ code: "FORBIDDEN" });
          }
          if (entry.status !== "bozza") {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Solo un'iscrizione in bozza si può confermare",
            });
          }
          const { cls, event, category } = await loadClassContext(
            tx,
            entry.classId,
          );
          void cls;
          const warnings = await computeWarnings(
            tx,
            category.id,
            entry.riderId,
            entry.horseId,
            entry.tecnicoName,
            new Date(event.startDate).getFullYear(),
          );
          await tx
            .update(schema.entries)
            .set({ status: "confermata", eligibilityWarnings: warnings })
            .where(eq(schema.entries.id, entryId));
        }
      });
      const quote = await quoteForEntries(ctx.db, input.entryIds);
      return { confirmed: input.entryIds.length, quote };
    }),

  /**
   * Check-in (flusso D): si completa anche con avvisi di eleggibilità aperti
   * (BR-18) — l'organizzatore vede e decide; gli avvisi restano in traccia.
   */
  checkIn: verifiedProcedure
    .input(z.object({ entryId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [entry] = await ctx.db
        .select()
        .from(schema.entries)
        .where(eq(schema.entries.id, input.entryId));
      if (!entry) throw new TRPCError({ code: "NOT_FOUND" });
      const { event } = await loadClassContext(ctx.db, entry.classId);
      if (
        !can(ctx.actor, "event.checkin", {
          organizationId: event.organizationId,
          eventId: event.id,
        })
      ) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      if (entry.status !== "confermata") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Il check-in richiede un'iscrizione confermata",
        });
      }
      await ctx.db
        .update(schema.entries)
        .set({ status: "check_in" })
        .where(eq(schema.entries.id, input.entryId));
      return { status: "check_in" as const };
    }),

  /**
   * Scratch (BR-17): la transizione a ritirata NON tocca la fee, che resta
   * dovuta (BR-03: si conta sui confermati, ritiri inclusi).
   */
  scratch: verifiedProcedure
    .input(z.object({ entryId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [entry] = await ctx.db
        .select()
        .from(schema.entries)
        .where(eq(schema.entries.id, input.entryId));
      if (!entry) throw new TRPCError({ code: "NOT_FOUND" });
      const { event } = await loadClassContext(ctx.db, entry.classId);

      const asOrganizer = can(ctx.actor, "event.checkin", {
        organizationId: event.organizationId,
        eventId: event.id,
      });
      if (!asOrganizer) {
        // Self-serve: solo se l'organizzatore l'ha abilitato (BR-17) e da
        // parte del titolare del binomio (cavaliere, owner o scuderia).
        if (!event.selfScratchEnabled) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "Per questo show il ritiro si comunica all'organizzazione",
          });
        }
        if (!(await canManageEntry(ctx.db, ctx.actor, entry))) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
      }
      if (!["bozza", "confermata", "check_in"].includes(entry.status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Questa iscrizione non è più ritirabile in-app",
        });
      }
      // Cutoff BR-17 "fino al proprio turno": se una run del binomio è oltre
      // 'attesa' il binomio sta entrando (o è entrato) in campo — non è più
      // uno scratch, è materia di gara (assente / no_score).
      const entryRuns = await ctx.db
        .select()
        .from(schema.runs)
        .where(eq(schema.runs.entryId, entry.id));
      if (entryRuns.some((r) => r.status !== "attesa")) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Il turno del binomio è già iniziato: non è più uno scratch",
        });
      }
      await ctx.db.transaction(async (tx) => {
        // La run in attesa sparisce (nulla di giudicato da preservare);
        // il draw_number resta: il buco NON si ricompatta (BR-17).
        await tx
          .delete(schema.runs)
          .where(
            and(eq(schema.runs.entryId, entry.id), eq(schema.runs.status, "attesa")),
          );
        await tx
          .update(schema.entries)
          .set({ status: "ritirata" })
          .where(eq(schema.entries.id, input.entryId));
      });
      liveBus.tick(event.id, "entry.scratched"); // ETA e marker drag si muovono
      return { status: "ritirata" as const };
    }),

  /** Gli eventi a iscrizioni aperte, con la quota al cavaliere (per la scuderia). */
  openEvents: verifiedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select({
        id: schema.events.id,
        name: schema.events.name,
        venue: schema.events.venue,
        startDate: schema.events.startDate,
        endDate: schema.events.endDate,
        tier: schema.events.tier,
        feePerHorse: schema.events.feePerHorse,
        selfScratchEnabled: schema.events.selfScratchEnabled,
      })
      .from(schema.events)
      .where(eq(schema.events.status, "iscrizioni_aperte"))
      .orderBy(schema.events.startDate);
  }),

  /**
   * Le informazioni per iscriversi a un evento: quota al cavaliere e classi
   * con quote e posti rimasti. Fuori dal perimetro organizzatore: serve alla
   * griglia di iscrizione della scuderia (utente loggato basta).
   */
  enrollmentInfo: verifiedProcedure
    .input(z.object({ eventId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [event] = await ctx.db
        .select()
        .from(schema.events)
        .where(eq(schema.events.id, input.eventId));
      if (!event) throw new TRPCError({ code: "NOT_FOUND" });
      const classes = await ctx.db
        .select({
          id: schema.classes.id,
          name: schema.classes.name,
          entryFee: schema.classes.entryFee,
          maxEntries: schema.classes.maxEntries,
          categoryCode: schema.categories.code,
          categoryName: schema.categories.name,
          patternCode: schema.patterns.code,
          activeEntries: sql<number>`(select count(*) from ${schema.entries} e where e.class_id = ${schema.classes}.id and e.status not in ('ritirata','assente'))::int`,
        })
        .from(schema.classes)
        .innerJoin(
          schema.categories,
          eq(schema.categories.id, schema.classes.categoryId),
        )
        .innerJoin(
          schema.patterns,
          eq(schema.patterns.id, schema.classes.patternId),
        )
        .where(eq(schema.classes.eventId, input.eventId))
        .orderBy(
          sql`${schema.classes.scheduledOrder} nulls last`,
          schema.classes.createdAt,
        );
      // Coppie (classe, cavallo) già iscritte all'evento — TUTTI gli stati:
      // il vincolo di unicità blocca il re-insert anche dopo uno scratch,
      // quindi la griglia deve saperlo PRIMA del checkout (chip disabilitata),
      // non scoprirlo alla conferma.
      const enrolled = await ctx.db
        .select({
          classId: schema.entries.classId,
          horseId: schema.entries.horseId,
          status: schema.entries.status,
        })
        .from(schema.entries)
        .innerJoin(schema.classes, eq(schema.classes.id, schema.entries.classId))
        .where(eq(schema.classes.eventId, input.eventId));
      return {
        event: {
          id: event.id,
          name: event.name,
          venue: event.venue,
          startDate: event.startDate,
          endDate: event.endDate,
          status: event.status,
          feePerHorse: event.feePerHorse,
          selfScratchEnabled: event.selfScratchEnabled,
        },
        enrolled,
        classes: classes.map((c) => ({
          ...c,
          // Capienza (vincolo, non eleggibilità): null = nessun limite.
          remaining:
            c.maxEntries === null
              ? null
              : Math.max(0, c.maxEntries - c.activeEntries),
        })),
      };
    }),

  /**
   * Le iscrizioni della scuderia: i binomi con cavallo del roster o cavaliere
   * membro, in ogni evento. Stato, draw number (quando pubblicato), avvisi in
   * traccia — la vista "le mie iscrizioni" del referente.
   */
  byStable: verifiedProcedure
    .input(z.object({ stableId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!can(ctx.actor, "entries.bulk", { stableId: input.stableId })) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const memberIds = ctx.db
        .select({ id: schema.stableMembers.personId })
        .from(schema.stableMembers)
        .where(eq(schema.stableMembers.stableId, input.stableId));
      const stableHorseIds = ctx.db
        .select({ id: schema.horses.id })
        .from(schema.horses)
        .where(eq(schema.horses.stableId, input.stableId));
      return ctx.db
        .select({
          entryId: schema.entries.id,
          status: schema.entries.status,
          drawNumber: schema.entries.drawNumber,
          eligibilityWarnings: schema.entries.eligibilityWarnings,
          horseName: schema.horses.name,
          riderName: personDisplayNameSql,
          classId: schema.classes.id,
          className: schema.classes.name,
          drawStatus: schema.classes.drawStatus,
          eventId: schema.events.id,
          eventName: schema.events.name,
          eventStatus: schema.events.status,
          eventStartDate: schema.events.startDate,
          selfScratchEnabled: schema.events.selfScratchEnabled,
        })
        .from(schema.entries)
        .innerJoin(schema.horses, eq(schema.horses.id, schema.entries.horseId))
        .innerJoin(schema.persons, eq(schema.persons.id, schema.entries.riderId))
        .innerJoin(schema.classes, eq(schema.classes.id, schema.entries.classId))
        .innerJoin(schema.events, eq(schema.events.id, schema.classes.eventId))
        .where(
          sql`${schema.entries.horseId} in ${stableHorseIds} or ${schema.entries.riderId} in ${memberIds}`,
        )
        .orderBy(
          sql`${schema.events.startDate} desc`,
          schema.classes.name,
          sql`${schema.entries.drawNumber} nulls last`,
        );
    }),

  /**
   * Registro binomi dell'evento (cavalli e cavalieri già iscritti in una sua
   * classe): alimenta il picker della late entry — al cancello il binomio è
   * quasi sempre già allo show.
   */
  registryByEvent: verifiedProcedure
    .input(z.object({ eventId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [event] = await ctx.db
        .select()
        .from(schema.events)
        .where(eq(schema.events.id, input.eventId));
      if (!event) throw new TRPCError({ code: "NOT_FOUND" });
      if (
        !can(ctx.actor, "event.registry.manage", {
          organizationId: event.organizationId,
          eventId: event.id,
        })
      ) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const classIds = ctx.db
        .select({ id: schema.classes.id })
        .from(schema.classes)
        .where(eq(schema.classes.eventId, input.eventId));
      const horses = await ctx.db
        .selectDistinct({
          id: schema.horses.id,
          name: schema.horses.name,
          microchip: schema.horses.microchip,
        })
        .from(schema.entries)
        .innerJoin(schema.horses, eq(schema.horses.id, schema.entries.horseId))
        .where(inArray(schema.entries.classId, classIds));
      const riders = await ctx.db
        .selectDistinct({
          id: schema.persons.id,
          fullName: personDisplayNameSql,
        })
        .from(schema.entries)
        .innerJoin(schema.persons, eq(schema.persons.id, schema.entries.riderId))
        .where(inArray(schema.entries.classId, classIds));
      return { horses, riders };
    }),

  /**
   * B3 (BR-94): i binomi FLAGGATI dell'evento — avvisi ricalcolati LIVE
   * (mai snapshot), lista filtrabile lato regia. Struttura estensibile: un
   * flag nuovo è un codice nuovo dell'evaluator, niente migrazioni.
   */
  flaggedByEvent: verifiedProcedure
    .input(z.object({ eventId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [event] = await ctx.db
        .select()
        .from(schema.events)
        .where(eq(schema.events.id, input.eventId));
      if (!event) throw new TRPCError({ code: "NOT_FOUND" });
      if (
        !can(ctx.actor, "event.registry.manage", {
          organizationId: event.organizationId,
          eventId: event.id,
        })
      ) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const rows = await ctx.db
        .select({
          entry: schema.entries,
          className: schema.classes.name,
          categoryId: schema.classes.categoryId,
          horseName: schema.horses.name,
          stableId: schema.horses.stableId,
          riderName: personDisplayNameSql,
        })
        .from(schema.entries)
        .innerJoin(schema.classes, eq(schema.classes.id, schema.entries.classId))
        .innerJoin(schema.horses, eq(schema.horses.id, schema.entries.horseId))
        .innerJoin(schema.persons, eq(schema.persons.id, schema.entries.riderId))
        .where(
          and(
            eq(schema.classes.eventId, input.eventId),
            inArray(schema.entries.status, ["confermata", "check_in"]),
          ),
        );
      const year = new Date(event.startDate).getFullYear();
      const withWarnings = await Promise.all(
        rows.map(async (r) => ({
          entryId: r.entry.id,
          className: r.className,
          horseName: r.horseName,
          riderName: r.riderName,
          stableId: r.stableId,
          warnings: await computeWarnings(
            ctx.db,
            r.categoryId,
            r.entry.riderId,
            r.entry.horseId,
            r.entry.tecnicoName,
            year,
          ),
        })),
      );
      return withWarnings.filter((r) => r.warnings.length > 0);
    }),

  /**
   * B3 (BR-94) "avvisa la scuderia": un tocco → email al referente della
   * scuderia del cavallo (fallback: cavaliere, poi proprietario) col
   * problema in linguaggio umano e l'azione richiesta, nella sua lingua
   * (BR-62). Auditata. Il sistema SEGNALA, mai blocca (BR-18).
   */
  notifyFlagged: verifiedProcedure
    .input(z.object({ entryId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .select({
          entry: schema.entries,
          cls: schema.classes,
          event: schema.events,
          horse: schema.horses,
        })
        .from(schema.entries)
        .innerJoin(schema.classes, eq(schema.classes.id, schema.entries.classId))
        .innerJoin(schema.events, eq(schema.events.id, schema.classes.eventId))
        .innerJoin(schema.horses, eq(schema.horses.id, schema.entries.horseId))
        .where(eq(schema.entries.id, input.entryId));
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      if (
        !can(ctx.actor, "event.registry.manage", {
          organizationId: row.event.organizationId,
          eventId: row.event.id,
        })
      ) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const warnings = await computeWarnings(
        ctx.db,
        row.cls.categoryId,
        row.entry.riderId,
        row.entry.horseId,
        row.entry.tecnicoName,
        new Date(row.event.startDate).getFullYear(),
      );
      if (warnings.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Nessun controllo aperto per questo binomio",
        });
      }
      // Destinatario: referente della scuderia del cavallo; in mancanza il
      // cavaliere, poi il proprietario del cavallo.
      let recipient: { email: string | null; locale: string } | undefined;
      if (row.horse.stableId) {
        const [ref] = await ctx.db
          .select({ email: schema.persons.email, locale: schema.persons.locale })
          .from(schema.stables)
          .innerJoin(schema.persons, eq(schema.persons.id, schema.stables.referentId))
          .where(eq(schema.stables.id, row.horse.stableId));
        if (ref?.email) recipient = ref;
      }
      if (!recipient) {
        const [rider] = await ctx.db
          .select({ email: schema.persons.email, locale: schema.persons.locale })
          .from(schema.persons)
          .where(eq(schema.persons.id, row.entry.riderId));
        if (rider?.email) recipient = rider;
      }
      if (!recipient) {
        const [owner] = await ctx.db
          .select({ email: schema.persons.email, locale: schema.persons.locale })
          .from(schema.persons)
          .where(eq(schema.persons.id, row.horse.ownerId));
        if (owner?.email) recipient = owner;
      }
      if (!recipient?.email) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Nessuna email a cui inviare l'avviso: né scuderia, né cavaliere, né proprietario",
        });
      }
      const lang = recipient.locale === "en" ? ("en" as const) : ("it" as const);
      const heading =
        lang === "it"
          ? `Controlli sull'iscrizione · ${row.horse.name}`
          : `Entry checks · ${row.horse.name}`;
      const intro =
        lang === "it"
          ? `La segreteria di ${row.event.name} segnala alcuni dati da sistemare per ${row.horse.name} (${row.cls.name}):`
          : `The ${row.event.name} show office flagged some details to fix for ${row.horse.name} (${row.cls.name}):`;
      const outro =
        lang === "it"
          ? "La maggior parte dei dati si sistema dal roster della tua scuderia su PenRunner. Nessuna iscrizione è bloccata: sono controlli da chiudere prima del check-in."
          : "Most details can be fixed from your stable roster on PenRunner. No entry is blocked: these are checks to close before check-in.";
      const { text, html } = renderMail(lang, {
        heading,
        paragraphs: [intro, ...warnings.map((w) => `• ${warnLine(w, lang)}`), outro],
      });
      await ctx.mailer.send({
        to: recipient.email,
        subject: `${heading} · ${row.event.name}`,
        body: text,
        html,
      });
      await recordAudit(ctx.db, {
        actorUserId: ctx.actor.kind === "user" ? ctx.actor.userId : null,
        action: "vetting.notify",
        entityType: "entry",
        entityId: row.entry.id,
        after: { codes: warnings.map((w) => w.code), sentTo: recipient.email },
      });
      return { sentTo: recipient.email };
    }),

  /** Vista organizzatore/segreteria: iscrizioni di una classe con avvisi. */
  listByClass: verifiedProcedure
    .input(z.object({ classId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { event, category } = await loadClassContext(ctx.db, input.classId);
      if (
        !can(ctx.actor, "event.registry.manage", {
          organizationId: event.organizationId,
          eventId: event.id,
        })
      ) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const rows = await ctx.db
        .select()
        .from(schema.entries)
        .where(eq(schema.entries.classId, input.classId));
      return Promise.all(
        rows.map(async (entry) => ({
          ...entry,
          liveWarnings: await computeWarnings(
            ctx.db,
            category.id,
            entry.riderId,
            entry.horseId,
            entry.tecnicoName,
            new Date(event.startDate).getFullYear(),
          ),
        })),
      );
    }),
});
