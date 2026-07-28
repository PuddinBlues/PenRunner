import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray, isNotNull, max, sql } from "drizzle-orm";
import { z } from "zod";
import { schema, type Db } from "@penrunner/db";
import { personDisplayNameSql } from "../services/names.js";
import { computeDragMarkers, generateDraw } from "../draw.js";
import { can, type Actor } from "../policy/policy.js";
import { recordAudit } from "../services/audit.js";
import { renderMail } from "../services/mailtemplate.js";
import { router, publicProcedure, verifiedProcedure } from "../trpc.js";

// ---------------------------------------------------------------------------
// Draw order (flusso E, BR-19/43). L'ordine di esecuzione vive SOLO su
// entries.draw_number: le run non portano posizione. Il draw pubblicato è
// sacro — il sistema è progettato per non favorire nessuno: la chirurgia è
// una capacità concessa per evento (BR-43) e ogni intervento è auditato.
// ---------------------------------------------------------------------------

type DbOrTx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

const DRAWABLE_STATUSES = ["confermata", "check_in"] as const;

async function loadClass(db: DbOrTx, classId: string) {
  const [row] = await db
    .select({ cls: schema.classes, event: schema.events })
    .from(schema.classes)
    .innerJoin(schema.events, eq(schema.events.id, schema.classes.eventId))
    .where(eq(schema.classes.id, classId));
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Classe inesistente" });
  return row;
}

function requireDrawManage(
  actor: Actor,
  event: typeof schema.events.$inferSelect,
) {
  if (
    !can(actor, "event.draw.manage", {
      organizationId: event.organizationId,
      eventId: event.id,
    })
  ) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
}

/** BR-43: la chirurgia richiede la capacità concessa sull'evento. */
function requireSurgery(event: typeof schema.events.$inferSelect) {
  if (!event.drawSurgeryEnabled) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "La modifica del draw pubblicato non è abilitata per questo evento: richiedila a PenRunner (BR-43)",
    });
  }
}

async function classRows(db: DbOrTx, classId: string) {
  return db
    .select()
    .from(schema.entries)
    .where(
      and(eq(schema.entries.classId, classId), isNotNull(schema.entries.drawNumber)),
    )
    .orderBy(asc(schema.entries.drawNumber));
}

async function dragMarkersOf(
  db: DbOrTx,
  classId: string,
  dragEveryNRuns: number,
) {
  const rows = await classRows(db, classId);
  return computeDragMarkers(
    rows.map((e) => ({
      drawNumber: e.drawNumber!,
      effective: e.status !== "ritirata" && e.status !== "assente",
    })),
    dragEveryNRuns,
  );
}

/**
 * BR-43: se la posizione è la prima dopo un confine di drag ("arena pulita",
 * vantaggio competitivo), l'audit lo annota automaticamente.
 */
async function postDragNote(
  db: DbOrTx,
  classId: string,
  event: typeof schema.events.$inferSelect,
  drawNumber: number,
): Promise<string | null> {
  const markers = await dragMarkersOf(db, classId, event.dragEveryNRuns);
  const rows = await classRows(db, classId);
  const effective = rows.filter(
    (e) => e.status !== "ritirata" && e.status !== "assente",
  );
  for (const m of markers) {
    const next = effective.find((e) => e.drawNumber! > m);
    if (next?.drawNumber === drawNumber) {
      return `Posizione ${drawNumber}: prima partenza dopo il drag (arena pulita)`;
    }
  }
  return null;
}

async function guardFreePosition(
  db: DbOrTx,
  classId: string,
  position: number,
) {
  const [taken] = await db
    .select({ id: schema.entries.id })
    .from(schema.entries)
    .where(
      and(
        eq(schema.entries.classId, classId),
        eq(schema.entries.drawNumber, position),
      ),
    );
  if (taken) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `La posizione ${position} è già occupata`,
    });
  }
}

async function createRunFor(tx: DbOrTx, entryId: string) {
  await tx
    .insert(schema.runs)
    .values({ entryId, goRound: 1 })
    .onConflictDoNothing();
}

export const drawRouter = router({
  /** Generazione (o re-draw finché in bozza): shuffle + distanziamento BR-19. */
  generate: verifiedProcedure
    .input(
      z.object({
        classId: z.string().uuid(),
        minRiderGap: z.number().int().min(0).max(50).default(8),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { cls, event } = await loadClass(ctx.db, input.classId);
      requireDrawManage(ctx.actor, event);
      if (cls.drawStatus === "pubblicato") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Il draw è pubblicato: niente re-draw (solo chirurgia BR-43)",
        });
      }
      const candidates = await ctx.db
        .select()
        .from(schema.entries)
        .where(
          and(
            eq(schema.entries.classId, input.classId),
            inArray(schema.entries.status, [...DRAWABLE_STATUSES]),
          ),
        );
      if (candidates.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Nessuna iscrizione confermata da sorteggiare",
        });
      }
      const result = generateDraw(
        candidates.map((e) => ({ entryId: e.id, riderId: e.riderId })),
        { minRiderGap: input.minRiderGap },
      );
      await ctx.db.transaction(async (tx) => {
        // azzera e riassegna (evita collisioni con l'indice unico)
        await tx
          .update(schema.entries)
          .set({ drawNumber: null })
          .where(eq(schema.entries.classId, input.classId));
        for (const [i, entryId] of result.order.entries()) {
          await tx
            .update(schema.entries)
            .set({ drawNumber: i + 1 })
            .where(eq(schema.entries.id, entryId));
        }
        await tx
          .update(schema.classes)
          .set({ drawStatus: "generato" })
          .where(eq(schema.classes.id, input.classId));
      });
      return result;
    }),

  /** Pubblica: congela il draw, crea le run (go 1, attesa), notifica. */
  publish: verifiedProcedure
    .input(z.object({ classId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { cls, event } = await loadClass(ctx.db, input.classId);
      requireDrawManage(ctx.actor, event);
      if (cls.drawStatus !== "generato") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Genera il draw prima di pubblicarlo",
        });
      }
      const drawn = await classRows(ctx.db, input.classId);
      await ctx.db.transaction(async (tx) => {
        for (const entry of drawn) await createRunFor(tx, entry.id);
        await tx
          .update(schema.classes)
          .set({ drawStatus: "pubblicato" })
          .where(eq(schema.classes.id, input.classId));
        await recordAudit(tx, {
          actorUserId: ctx.actor.kind === "user" ? ctx.actor.userId : null,
          action: "draw.publish",
          entityType: "class",
          entityId: input.classId,
          after: { entries: drawn.length },
        });
      });
      // Notifica agli iscritti, nella LINGUA del destinatario (BR-62 — il
      // censimento del giro UX ha trovato questa email hardcoded in
      // italiano) e col template brand.
      const riders = await ctx.db
        .selectDistinct({
          email: schema.persons.email,
          locale: schema.persons.locale,
        })
        .from(schema.entries)
        .innerJoin(schema.persons, eq(schema.persons.id, schema.entries.riderId))
        .where(eq(schema.entries.classId, input.classId));
      for (const r of riders) {
        if (!r.email) continue;
        const locale = r.locale === "en" ? ("en" as const) : ("it" as const);
        const { text, html } = renderMail(locale, {
          heading:
            locale === "it"
              ? `Draw pubblicato · ${cls.name}`
              : `Draw published · ${cls.name}`,
          paragraphs:
            locale === "it"
              ? ["L'ordine di partenza della tua classe è stato pubblicato. Trovi la start list e il turno stimato sulla pagina dell'evento."]
              : ["Your class's running order has been published. Find the start list and your estimated turn on the event page."],
        });
        await ctx.mailer.send({
          to: r.email,
          subject:
            locale === "it"
              ? `Draw pubblicato · ${cls.name}`
              : `Draw published · ${cls.name}`,
          body: text,
          html,
        });
      }
      return { published: drawn.length };
    }),

  /** Chirurgia (BR-43, capacità concessa): sposta a una posizione libera. */
  setPosition: verifiedProcedure
    .input(
      z.object({ entryId: z.string().uuid(), position: z.number().int().min(1) }),
    )
    .mutation(async ({ ctx, input }) => {
      const [entry] = await ctx.db
        .select()
        .from(schema.entries)
        .where(eq(schema.entries.id, input.entryId));
      if (!entry) throw new TRPCError({ code: "NOT_FOUND" });
      const { cls, event } = await loadClass(ctx.db, entry.classId);
      requireDrawManage(ctx.actor, event);
      if (cls.drawStatus !== "pubblicato") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Prima della pubblicazione usa il re-draw",
        });
      }
      requireSurgery(event);
      await guardFreePosition(ctx.db, entry.classId, input.position);
      const actorUserId = ctx.actor.kind === "user" ? ctx.actor.userId : null;
      await ctx.db.transaction(async (tx) => {
        await tx
          .update(schema.entries)
          .set({ drawNumber: input.position })
          .where(eq(schema.entries.id, input.entryId));
        const note = await postDragNote(tx, entry.classId, event, input.position);
        await recordAudit(tx, {
          actorUserId,
          action: "draw.position.set",
          entityType: "entry",
          entityId: input.entryId,
          before: { drawNumber: entry.drawNumber },
          after: { drawNumber: input.position },
          ...(note ? { note } : {}),
        });
      });
      return { drawNumber: input.position };
    }),

  /** Chirurgia (BR-43): scambio atomico di due posizioni. */
  swapPositions: verifiedProcedure
    .input(
      z.object({ entryAId: z.string().uuid(), entryBId: z.string().uuid() }),
    )
    .mutation(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select()
        .from(schema.entries)
        .where(inArray(schema.entries.id, [input.entryAId, input.entryBId]));
      const a = rows.find((r) => r.id === input.entryAId);
      const b = rows.find((r) => r.id === input.entryBId);
      if (!a || !b || a.classId !== b.classId || !a.drawNumber || !b.drawNumber) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Servono due iscrizioni sorteggiate della stessa classe",
        });
      }
      const { cls, event } = await loadClass(ctx.db, a.classId);
      requireDrawManage(ctx.actor, event);
      if (cls.drawStatus !== "pubblicato") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Prima della pubblicazione usa il re-draw",
        });
      }
      requireSurgery(event);
      const actorUserId = ctx.actor.kind === "user" ? ctx.actor.userId : null;
      await ctx.db.transaction(async (tx) => {
        await tx
          .update(schema.entries)
          .set({ drawNumber: null })
          .where(eq(schema.entries.id, a.id));
        await tx
          .update(schema.entries)
          .set({ drawNumber: a.drawNumber })
          .where(eq(schema.entries.id, b.id));
        await tx
          .update(schema.entries)
          .set({ drawNumber: b.drawNumber })
          .where(eq(schema.entries.id, a.id));
        const notes = (
          await Promise.all([
            postDragNote(tx, a.classId, event, b.drawNumber!),
            postDragNote(tx, a.classId, event, a.drawNumber!),
          ])
        ).filter(Boolean);
        await recordAudit(tx, {
          actorUserId,
          action: "draw.position.swap",
          entityType: "class",
          entityId: a.classId,
          before: { [a.id]: a.drawNumber, [b.id]: b.drawNumber },
          after: { [a.id]: b.drawNumber, [b.id]: a.drawNumber },
          ...(notes.length ? { note: notes.join(" · ") } : {}),
        });
      });
      return { swapped: true };
    }),

  /**
   * Late entry (flusso C/E): concessione manuale dell'organizzatore a
   * iscrizioni chiuse. In coda (max+1) sempre; a posizione concordata solo
   * con la capacità BR-43. Sempre auditata.
   */
  addLateEntry: verifiedProcedure
    .input(
      z.object({
        classId: z.string().uuid(),
        horseId: z.string().uuid(),
        riderId: z.string().uuid(),
        tecnicoName: z.string().max(200).optional(),
        position: z.number().int().min(1).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { cls, event } = await loadClass(ctx.db, input.classId);
      requireDrawManage(ctx.actor, event);
      if (input.position !== undefined) {
        requireSurgery(event); // posizione concordata = chirurgia (BR-43)
        await guardFreePosition(ctx.db, input.classId, input.position);
      }
      const actorUserId = ctx.actor.kind === "user" ? ctx.actor.userId : null;
      return ctx.db.transaction(async (tx) => {
        const [tail] = await tx
          .select({ max: max(schema.entries.drawNumber) })
          .from(schema.entries)
          .where(eq(schema.entries.classId, input.classId));
        const position = input.position ?? (tail?.max ?? 0) + 1;
        let entry;
        try {
          [entry] = await tx
            .insert(schema.entries)
            .values({
              classId: input.classId,
              horseId: input.horseId,
              riderId: input.riderId,
              tecnicoName: input.tecnicoName ?? null,
              status: "confermata",
              drawNumber: position,
            })
            .returning();
        } catch (err) {
          for (let e: unknown = err; e instanceof Error; e = e.cause) {
            if (e.message.includes("entries_class_horse")) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Questo cavallo è già iscritto a questa classe",
              });
            }
          }
          throw err;
        }
        if (cls.drawStatus === "pubblicato") await createRunFor(tx, entry!.id);
        const note = await postDragNote(tx, input.classId, event, position);
        await recordAudit(tx, {
          actorUserId,
          action: "draw.late_entry.add",
          entityType: "entry",
          entityId: entry!.id,
          after: { classId: input.classId, drawNumber: position },
          ...(note ? { note } : {}),
        });
        return { entryId: entry!.id, drawNumber: position };
      });
    }),

  /** Start list pubblica (draw pubblicato) con marker di drag live (BR-51). */
  startList: publicProcedure
    .input(z.object({ classId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { cls, event } = await loadClass(ctx.db, input.classId);
      if (cls.drawStatus !== "pubblicato") {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Start list non ancora pubblicata",
        });
      }
      const rows = await ctx.db
        .select({
          entryId: schema.entries.id,
          drawNumber: schema.entries.drawNumber,
          status: schema.entries.status,
          horseName: schema.horses.name,
          riderName: personDisplayNameSql,
        })
        .from(schema.entries)
        .innerJoin(schema.horses, eq(schema.horses.id, schema.entries.horseId))
        .innerJoin(schema.persons, eq(schema.persons.id, schema.entries.riderId))
        .where(
          and(
            eq(schema.entries.classId, input.classId),
            isNotNull(schema.entries.drawNumber),
          ),
        )
        .orderBy(asc(schema.entries.drawNumber));
      const list = rows.map((r) => ({
        ...r,
        scratched: r.status === "ritirata" || r.status === "assente",
      }));
      return {
        className: cls.name,
        dragEveryNRuns: event.dragEveryNRuns,
        // Derivati sulle run effettive: uno scratch sposta il confine e qui
        // si vede subito (BR-51) — la numerazione del draw invece non cambia.
        dragAfter: computeDragMarkers(
          list.map((r) => ({ drawNumber: r.drawNumber!, effective: !r.scratched })),
          event.dragEveryNRuns,
        ),
        entries: list,
      };
    }),
});
