import { TRPCError } from "@trpc/server";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { schema, type Db } from "@penrunner/db";
import { evaluateEligibility, type EligibilityWarning } from "../eligibility.js";
import { can, type Actor } from "../policy/policy.js";
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
        // Placeholder MVP: il limite reale è "fino al proprio turno" e arriva
        // con il draw (step 4); qui blocchiamo solo a evento concluso.
        if (event.status === "concluso") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "L'evento è concluso",
          });
        }
      }
      if (!["bozza", "confermata", "check_in"].includes(entry.status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Questa iscrizione non è più ritirabile in-app",
        });
      }
      await ctx.db
        .update(schema.entries)
        .set({ status: "ritirata" })
        .where(eq(schema.entries.id, input.entryId));
      return { status: "ritirata" as const };
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
