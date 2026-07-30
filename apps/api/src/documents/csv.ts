import { asc, eq } from "drizzle-orm";
import { schema, type Db } from "@penrunner/db";
import { personOfficialNameSql } from "../services/names.js";
import { buildClassRanking } from "../routers/live.js";
import { buildClassPayout } from "../routers/payout.js";

// ---------------------------------------------------------------------------
// Export CSV (B4): dati GREZZI per i fogli di calcolo della segreteria,
// accanto a ogni PDF. Contratto macchina, non copy: intestazioni STABILI in
// inglese snake_case (mai localizzate — chi ci costruisce sopra formule non
// deve vederle cambiare), numeri col punto decimale, UTF-8 con BOM perché
// Excel apra gli accenti giusti al doppio click. La resa umana resta nel PDF.
// ---------------------------------------------------------------------------

type DbOrTx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

export interface CsvDoc {
  headers: string[];
  rows: (string | number | null)[][];
}

/** Separatori ammessi: ";" (default — Excel in locale it) oppure ",". */
export function csvSeparator(query: unknown): string {
  return (query as { sep?: string })?.sep === "," ? "," : ";";
}

const BOM = "\uFEFF";

function escapeCell(value: string | number | null, sep: string): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  // quoting RFC 4180: campo con separatore, virgolette o a-capo va quotato
  if (s.includes(sep) || s.includes('"') || /[\r\n]/.test(s)) {
    return `"${s.replaceAll('"', '""')}"`;
  }
  return s;
}

export function csvString(doc: CsvDoc, sep: string): string {
  const lines = [doc.headers, ...doc.rows].map((row) =>
    row.map((cell) => escapeCell(cell, sep)).join(sep),
  );
  return BOM + lines.join("\r\n") + "\r\n";
}

export async function buildStartListCsv(
  db: DbOrTx,
  classId: string,
): Promise<CsvDoc> {
  const rows = await db
    .select({
      drawNumber: schema.entries.drawNumber,
      status: schema.entries.status,
      horseName: schema.horses.name,
      riderName: personOfficialNameSql,
    })
    .from(schema.entries)
    .innerJoin(schema.horses, eq(schema.horses.id, schema.entries.horseId))
    .innerJoin(schema.persons, eq(schema.persons.id, schema.entries.riderId))
    .where(eq(schema.entries.classId, classId))
    .orderBy(asc(schema.entries.drawNumber));
  return {
    headers: ["draw", "horse", "rider", "status"],
    rows: rows.map((r) => [r.drawNumber, r.horseName, r.riderName, r.status]),
  };
}

export async function buildResultsCsv(
  db: DbOrTx,
  classId: string,
  now: Date,
): Promise<CsvDoc> {
  const data = await buildClassRanking(db, classId, now);
  const rows: (string | number | null)[][] = data.ranking.map((r) => [
    r.position,
    r.horseName,
    r.riderOfficialName,
    r.total,
    r.outcome,
    r.state,
  ]);
  for (const r of data.excluded) {
    rows.push([null, r.horseName, r.riderOfficialName, null, "no_score", "scored"]);
  }
  return {
    headers: ["position", "horse", "rider", "score", "outcome", "state"],
    rows,
  };
}

export async function buildPayoutCsv(
  db: DbOrTx,
  classId: string,
): Promise<CsvDoc> {
  const data = await buildClassPayout(db, classId);
  const rows: (string | number | null)[][] = [];
  for (const p of data.payout.placements) {
    for (const b of p.binomi) {
      // importo in euro col punto decimale: raw, pronto per SUM()
      rows.push([p.rank, b.horseName, b.riderOfficialName, b.amountCents / 100]);
    }
  }
  return { headers: ["rank", "horse", "rider", "amount_eur"], rows };
}
