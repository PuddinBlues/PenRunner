import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { createDb, schema, type Db } from "@penrunner/db";
import { resolveActor } from "../context.js";
import { can } from "../policy/policy.js";
import {
  buildPayoutCsv,
  buildResultsCsv,
  buildStartListCsv,
  csvSeparator,
  csvString,
} from "./csv.js";
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
// Nome file: regola UNICA per tutti i documenti (censimento: il telefono
// salvava "document") — <DocType>_<Classe>_<Evento>_<YYYY-MM-DD>.pdf, in
// `attachment`: i PDF sono deliverable da salvare/condividere, il nome deve
// sopravvivere al download.
// ---------------------------------------------------------------------------

type DocType = "StartList" | "Results" | "Payout" | "ScoreCard";

function slugPart(s: string): string {
  const cleaned = s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // diacritici via, il resto resta ASCII
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim();
  if (!cleaned) return "Documento";
  return cleaned
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
}

function docFilename(
  docType: DocType,
  className: string,
  eventName: string,
  now: Date,
  ext: "pdf" | "csv" = "pdf",
): string {
  const day = now.toISOString().slice(0, 10);
  return `${docType}_${slugPart(className)}_${slugPart(eventName)}_${day}.${ext}`;
}

function localeOf(query: unknown): Locale {
  return (query as { locale?: string })?.locale === "en" ? "en" : "it";
}

function sendPdf(reply: FastifyReply, buf: Buffer, name: string) {
  reply
    .header("content-type", "application/pdf")
    .header("content-disposition", `attachment; filename="${name}"`)
    .send(buf);
}

function sendCsv(reply: FastifyReply, body: string, name: string) {
  reply
    .header("content-type", "text/csv; charset=utf-8")
    .header("content-disposition", `attachment; filename="${name}"`)
    .send(body);
}

function sessionOf(req: FastifyRequest): string | undefined {
  const bearer = req.headers.authorization?.replace(/^Bearer /, "");
  return req.cookies?.["penrunner_session"] ?? bearer ?? undefined;
}

async function classHeader(db: Db, classId: string) {
  const [row] = await db
    .select({
      className: schema.classes.name,
      eventName: schema.events.name,
    })
    .from(schema.classes)
    .innerJoin(schema.events, eq(schema.events.id, schema.classes.eventId))
    .where(eq(schema.classes.id, classId));
  return row;
}

async function eventForRun(db: Db, runId: string) {
  const [row] = await db
    .select({
      organizationId: schema.events.organizationId,
      eventId: schema.events.id,
      className: schema.classes.name,
      eventName: schema.events.name,
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
      const head = await classHeader(db, req.params.classId);
      if (!head) return reply.code(404).send({ error: "not found" });
      const now = new Date();
      const doc = await buildStartListDoc(db, req.params.classId, localeOf(req.query), now);
      sendPdf(
        reply,
        await renderTable(doc),
        docFilename("StartList", head.className, head.eventName, now),
      );
    },
  );

  server.get<{ Params: { classId: string }; Querystring: { locale?: string } }>(
    "/documents/class/:classId/results.pdf",
    async (req, reply) => {
      const head = await classHeader(db, req.params.classId);
      if (!head) return reply.code(404).send({ error: "not found" });
      const now = new Date();
      const doc = await buildResultsDoc(db, req.params.classId, localeOf(req.query), now);
      sendPdf(
        reply,
        await renderTable(doc),
        docFilename("Results", head.className, head.eventName, now),
      );
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
      const now = new Date();
      const doc = await buildPayoutDoc(db, req.params.classId, localeOf(req.query), now);
      sendPdf(
        reply,
        await renderTable(doc),
        docFilename("Payout", cls.name, event!.name, now),
      );
    },
  );

  // B4: CSV coi dati grezzi accanto a ogni PDF tabellare — stesse route,
  // stessa visibilità (start list e classifica pubbliche, payout gated),
  // stessa regola di naming con estensione .csv.
  server.get<{ Params: { classId: string }; Querystring: { sep?: string } }>(
    "/documents/class/:classId/start-list.csv",
    async (req, reply) => {
      const head = await classHeader(db, req.params.classId);
      if (!head) return reply.code(404).send({ error: "not found" });
      const now = new Date();
      const doc = await buildStartListCsv(db, req.params.classId);
      sendCsv(
        reply,
        csvString(doc, csvSeparator(req.query)),
        docFilename("StartList", head.className, head.eventName, now, "csv"),
      );
    },
  );

  server.get<{ Params: { classId: string }; Querystring: { sep?: string } }>(
    "/documents/class/:classId/results.csv",
    async (req, reply) => {
      const head = await classHeader(db, req.params.classId);
      if (!head) return reply.code(404).send({ error: "not found" });
      const now = new Date();
      const doc = await buildResultsCsv(db, req.params.classId, now);
      sendCsv(
        reply,
        csvString(doc, csvSeparator(req.query)),
        docFilename("Results", head.className, head.eventName, now, "csv"),
      );
    },
  );

  server.get<{ Params: { classId: string }; Querystring: { sep?: string } }>(
    "/documents/class/:classId/payout.csv",
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
      const now = new Date();
      const doc = await buildPayoutCsv(db, req.params.classId);
      sendCsv(
        reply,
        csvString(doc, csvSeparator(req.query)),
        docFilename("Payout", cls.name, event!.name, now, "csv"),
      );
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
    const now = new Date();
    const doc = await buildScoreCardDoc(
      db,
      req.params.runId,
      req.params.judgeId,
      localeOf(req.query),
      now,
    );
    sendPdf(
      reply,
      await renderScoreCard(doc),
      docFilename("ScoreCard", ev.className, ev.eventName, now),
    );
  });
}
