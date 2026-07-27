import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { createDb, schema, type Db } from "@penrunner/db";
import { resolveActor } from "../context.js";
import { can } from "../policy/policy.js";
import {
  buildPayoutDoc,
  buildResultsDoc,
  buildScoreCardDoc,
  buildStartListDoc,
  type Locale,
} from "./model.js";
import { renderScoreCard, renderTable } from "./render.js";

// ---------------------------------------------------------------------------
// Route PDF. Start list e classifica: pubbliche (info già pubblica). Payout e
// score card: organizzatore/segreteria. Sempre rigenerate da dati derivati
// live — mai cachate: un vecchio stampato è identificabile dal timestamp.
// ---------------------------------------------------------------------------

function localeOf(query: unknown): Locale {
  return (query as { locale?: string })?.locale === "en" ? "en" : "it";
}

function sendPdf(reply: FastifyReply, buf: Buffer, name: string) {
  reply
    .header("content-type", "application/pdf")
    .header("content-disposition", `inline; filename="${name}"`)
    .send(buf);
}

function sessionOf(req: FastifyRequest): string | undefined {
  const bearer = req.headers.authorization?.replace(/^Bearer /, "");
  return req.cookies?.["penrunner_session"] ?? bearer ?? undefined;
}

async function classExists(db: Db, classId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.classes.id })
    .from(schema.classes)
    .where(eq(schema.classes.id, classId));
  return !!row;
}

async function eventForRun(db: Db, runId: string) {
  const [row] = await db
    .select({
      organizationId: schema.events.organizationId,
      eventId: schema.events.id,
    })
    .from(schema.runs)
    .innerJoin(schema.entries, eq(schema.entries.id, schema.runs.entryId))
    .innerJoin(schema.classes, eq(schema.classes.id, schema.entries.classId))
    .innerJoin(schema.events, eq(schema.events.id, schema.classes.eventId))
    .where(eq(schema.runs.id, runId));
  return row;
}

export function registerDocumentRoutes(server: FastifyInstance) {
  const { db } = createDb();

  server.get<{ Params: { classId: string }; Querystring: { locale?: string } }>(
    "/documents/class/:classId/start-list.pdf",
    async (req, reply) => {
      if (!(await classExists(db, req.params.classId)))
        return reply.code(404).send({ error: "not found" });
      const doc = await buildStartListDoc(db, req.params.classId, localeOf(req.query), new Date());
      sendPdf(reply, await renderTable(doc), "start-list.pdf");
    },
  );

  server.get<{ Params: { classId: string }; Querystring: { locale?: string } }>(
    "/documents/class/:classId/results.pdf",
    async (req, reply) => {
      if (!(await classExists(db, req.params.classId)))
        return reply.code(404).send({ error: "not found" });
      const doc = await buildResultsDoc(db, req.params.classId, localeOf(req.query), new Date());
      sendPdf(reply, await renderTable(doc), "results.pdf");
    },
  );

  server.get<{ Params: { classId: string }; Querystring: { locale?: string } }>(
    "/documents/class/:classId/payout.pdf",
    async (req, reply) => {
      const [cls] = await db
        .select()
        .from(schema.classes)
        .where(eq(schema.classes.id, req.params.classId));
      if (!cls) return reply.code(404).send({ error: "not found" });
      const [event] = await db
        .select()
        .from(schema.events)
        .where(eq(schema.events.id, cls.eventId));
      const { actor } = await resolveActor(db, sessionOf(req));
      if (
        !can(actor, "payout.manage", {
          organizationId: event!.organizationId,
          eventId: event!.id,
        })
      ) {
        return reply.code(403).send({ error: "forbidden" });
      }
      const doc = await buildPayoutDoc(db, req.params.classId, localeOf(req.query), new Date());
      sendPdf(reply, await renderTable(doc), "payout.pdf");
    },
  );

  server.get<{
    Params: { runId: string; judgeId: string };
    Querystring: { locale?: string };
  }>("/documents/run/:runId/scorecard/:judgeId.pdf", async (req, reply) => {
    const ev = await eventForRun(db, req.params.runId);
    if (!ev) return reply.code(404).send({ error: "not found" });
    const { actor } = await resolveActor(db, sessionOf(req));
    if (
      !can(actor, "event.registry.manage", {
        organizationId: ev.organizationId,
        eventId: ev.eventId,
      })
    ) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const doc = await buildScoreCardDoc(
      db,
      req.params.runId,
      req.params.judgeId,
      localeOf(req.query),
      new Date(),
    );
    sendPdf(reply, await renderScoreCard(doc), "scorecard.pdf");
  });
}
