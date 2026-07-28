import { and, asc, eq } from "drizzle-orm";
import { schema, type Db } from "@penrunner/db";
import { officialName, personOfficialNameSql } from "../services/names.js";
import { computeCardScore } from "@penrunner/core";
import { buildClassRanking } from "../routers/live.js";
import { buildClassPayout } from "../routers/payout.js";

// ---------------------------------------------------------------------------
// Document-model builders: PURI (nessun pdfkit qui). Ritornano la struttura
// del documento — righe, totali, badge — tutti da `core`. Il totale è SEMPRE
// derivato (ricalcolato dal motore), mai letto da una colonna. Il renderer
// pdfkit consuma questo modello senza rifare conti.
// ---------------------------------------------------------------------------

type DbOrTx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

const euro = (cents: number) =>
  (cents / 100).toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export type Locale = "it" | "en";

/** Data/ora leggibili (censimento: mai ISO nudo nei documenti). */
export function fmtDateTime(d: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "it" ? "it-IT" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Rome",
  }).format(d);
}
function fmtDate(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "it" ? "it-IT" : "en-GB", {
    dateStyle: "medium",
    timeZone: "Europe/Rome",
  }).format(new Date(iso));
}

const L = {
  it: {
    startList: "Start list",
    results: "Classifica",
    payout: "Report montepremi",
    scorecard: "Score card",
    provisional: "PROVVISORIA — non ufficiale",
    official: "UFFICIALE",
    draw: "Draw",
    horse: "Cavallo",
    rider: "Cavaliere",
    position: "Pos.",
    score: "Score",
    scratched: "Ritirato",
    generatedAt: "Generato il",
    liveNote: "I dati live sulla piattaforma prevalgono su questo documento.",
    purse: "Montepremi",
    entryFees: "Iscrizioni",
    addedMoney: "Added money",
    trophy: "Trofei",
    orgExpense: "Spese org. (20%)",
    undistributed: "Non distribuito (show management)",
    formulaNote:
      "Montepremi ex ART. 15 Reg. Disciplina Reining FISE/IRHA 2025 (*base del 20%: sole iscrizioni, da precisare con la segreteria)",
    judge: "Giudice",
    pattern: "Pattern",
    runPenalty: "Penalità di run",
    maneuver: "Manovra",
    penalty: "Penalità",
    total: "Totale",
    signed: "Firmata",
    notSigned: "Non firmata",
    backfill: "Backfill cartaceo",
    inReview: "Score in review",
    noScoresYet: "Nessuno score ancora: la classifica si riempie con le run.",
  },
  en: {
    startList: "Start list",
    results: "Results",
    payout: "Payout report",
    scorecard: "Score card",
    provisional: "PROVISIONAL — not official",
    official: "OFFICIAL",
    draw: "Draw",
    horse: "Horse",
    rider: "Rider",
    position: "Pl.",
    score: "Score",
    scratched: "Scratched",
    generatedAt: "Generated at",
    liveNote: "Live data on the platform supersedes this document.",
    purse: "Purse",
    entryFees: "Entry fees",
    addedMoney: "Added money",
    trophy: "Trophies",
    orgExpense: "Org. expenses (20%)",
    undistributed: "Undistributed (show management)",
    formulaNote:
      "Purse per ART. 15 FISE/IRHA Reining Rules 2025 (*20% base: entry fees only, to be finalized with the secretariat)",
    judge: "Judge",
    pattern: "Pattern",
    runPenalty: "Run penalty",
    maneuver: "Maneuver",
    penalty: "Penalty",
    total: "Total",
    signed: "Signed",
    notSigned: "Not signed",
    backfill: "Paper backfill",
    inReview: "Score in review",
    noScoresYet: "No scores yet: the ranking fills up as runs are scored.",
  },
} as const;

export interface DocMeta {
  title: string;
  subtitle: string;
  /** badge TESTUALE inequivocabile anche in fotocopia b/n (non solo colore) */
  statusBadge: string | null;
  official: boolean;
  generatedAtIso: string;
  liveNote: string;
}

export interface TableDoc extends DocMeta {
  kind: "table";
  columns: string[];
  rows: string[][];
  footNotes: string[];
  /** al posto della tabella vuota: spiega PERCHÉ non ci sono righe */
  emptyNote?: string;
}

export interface ScoreCardDoc extends DocMeta {
  kind: "scorecard";
  header: { event: string; class: string; pattern: string; judge: string };
  maneuvers: Array<{ position: number; label: string; penalty: string; quality: string }>;
  runPenalty: string;
  total: string;
  signatureLine: string;
}

export async function buildStartListDoc(
  db: DbOrTx,
  classId: string,
  locale: Locale,
  now: Date,
): Promise<TableDoc> {
  const t = L[locale];
  const [cls] = await db.select().from(schema.classes).where(eq(schema.classes.id, classId));
  if (!cls) throw new Error("Classe inesistente");
  const [event] = await db
    .select()
    .from(schema.events)
    .where(eq(schema.events.id, cls.eventId));
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
    kind: "table",
    title: `${t.startList} · ${cls.name}`,
    subtitle: event
      ? `${event.name} · ${event.venue} · ${fmtDate(event.startDate, locale)}`
      : "",
    statusBadge: null,
    official: false,
    generatedAtIso: now.toISOString(),
    liveNote: t.liveNote,
    columns: [t.draw, t.horse, t.rider, ""],
    rows: rows.map((r) => [
      String(r.drawNumber ?? "—"),
      r.horseName,
      r.riderName,
      ["ritirata", "assente"].includes(r.status) ? t.scratched : "",
    ]),
    footNotes: [`${t.generatedAt}: ${fmtDateTime(now, locale)}`],
  };
}

export async function buildResultsDoc(
  db: DbOrTx,
  classId: string,
  locale: Locale,
  now: Date,
): Promise<TableDoc> {
  const t = L[locale];
  const data = await buildClassRanking(db, classId, now);
  // Nessuna run segnata: tabella vuota SPIEGATA, non una riga di trattini.
  const nothingScored =
    data.ranking.length > 0 &&
    data.ranking.every((r) => r.state !== "scored" && r.total === null);
  const rows = nothingScored ? [] : data.ranking.map((r) => [
    r.position === null ? "" : String(r.position),
    r.horseName,
    r.riderOfficialName,
    r.label ??
      (r.outcome === "score_0"
        ? "0"
        : r.total === null
          ? "—"
          : r.total.toFixed(1)),
  ]);
  if (!nothingScored) {
    for (const r of data.excluded) rows.push(["—", r.horseName, r.riderOfficialName, "no score"]);
  }
  return {
    kind: "table",
    title: `${t.results} · ${data.cls.name}`,
    subtitle: `${data.event.name} · ${data.event.venue} · ${fmtDate(data.event.startDate, locale)}`,
    ...(nothingScored ? { emptyNote: t.noScoresYet } : {}),
    // badge testuale: mai confondere una bozza con l'ufficiale, nemmeno in b/n
    statusBadge: data.official ? t.official : t.provisional,
    official: data.official,
    generatedAtIso: now.toISOString(),
    liveNote: t.liveNote,
    columns: [t.position, t.horse, t.rider, t.score],
    rows,
    footNotes: [
      data.firstPlaceTie ? "* pari merito al 1° posto: run-off / co-champion" : "",
      `${t.generatedAt}: ${fmtDateTime(now, locale)}`,
    ].filter(Boolean),
  };
}

export async function buildPayoutDoc(
  db: DbOrTx,
  classId: string,
  locale: Locale,
  now: Date,
): Promise<TableDoc> {
  const t = L[locale];
  const data = await buildClassPayout(db, classId);
  const rows: string[][] = [];
  for (const p of data.payout.placements) {
    for (const b of p.binomi) {
      rows.push([String(p.rank), b.horseName, b.riderOfficialName, `€ ${euro(b.amountCents)}`]);
    }
  }
  return {
    kind: "table",
    title: `${t.payout} · ${data.cls.name}`,
    subtitle: `${data.event.name} · ${data.event.venue} · ${fmtDate(data.event.startDate, locale)}`,
    statusBadge: data.official ? t.official : t.provisional,
    official: data.official,
    generatedAtIso: now.toISOString(),
    liveNote: t.liveNote,
    columns: [t.position, t.horse, t.rider, "€"],
    rows,
    // purse SEMPRE scomposto, con etichetta "da confermare"
    footNotes: [
      `${t.purse}: € ${euro(data.purse.purseCents)}`,
      `  ${t.entryFees}: € ${euro(data.purse.entryFeesCents)} · ${t.addedMoney}: € ${euro(data.purse.addedMoneyCents)} · −${t.trophy}: € ${euro(data.purse.trophyDeductionCents)} · −${t.orgExpense}: € ${euro(data.purse.orgExpenseCents)}`,
      data.payout.undistributedCents > 0
        ? `${t.undistributed}: € ${euro(data.payout.undistributedCents)}`
        : "",
      `${t.formulaNote}`,
      `${t.generatedAt}: ${fmtDateTime(now, locale)}`,
    ].filter(Boolean),
  };
}

export async function buildScoreCardDoc(
  db: DbOrTx,
  runId: string,
  judgeId: string,
  locale: Locale,
  now: Date,
): Promise<ScoreCardDoc> {
  const t = L[locale];
  const [row] = await db
    .select({
      card: schema.scoreCards,
      cls: schema.classes,
      event: schema.events,
      pattern: schema.patterns,
      horseName: schema.horses.name,
    })
    .from(schema.scoreCards)
    .innerJoin(schema.runs, eq(schema.runs.id, schema.scoreCards.runId))
    .innerJoin(schema.entries, eq(schema.entries.id, schema.runs.entryId))
    .innerJoin(schema.horses, eq(schema.horses.id, schema.entries.horseId))
    .innerJoin(schema.classes, eq(schema.classes.id, schema.entries.classId))
    .innerJoin(schema.events, eq(schema.events.id, schema.classes.eventId))
    .innerJoin(schema.patterns, eq(schema.patterns.id, schema.classes.patternId))
    .where(and(eq(schema.scoreCards.runId, runId), eq(schema.scoreCards.judgeId, judgeId)));
  if (!row) throw new Error("Score card inesistente");
  const [judge] = await db
    .select()
    .from(schema.persons)
    .where(eq(schema.persons.id, judgeId));
  // le colonne = i passi del pattern (verificato sulla card reale)
  const maneuverDefs = await db
    .select()
    .from(schema.patternManeuvers)
    .where(eq(schema.patternManeuvers.patternId, row.pattern.id))
    .orderBy(asc(schema.patternManeuvers.position));
  const scores = await db
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
    .where(eq(schema.maneuverScores.scoreCardId, row.card.id));
  const scoreByPos = new Map(scores.map((s) => [s.position, s]));

  // totale DERIVATO dal motore, mai da colonna
  const breakdown = computeCardScore({
    maneuvers: maneuverDefs.map((m) => ({
      position: m.position,
      quality: Number(scoreByPos.get(m.position)?.quality ?? 0),
      penalty: Number(scoreByPos.get(m.position)?.penalty ?? 0),
    })),
    runPenalty: Number(row.card.runPenalty),
    special: row.card.special,
  });

  const signatureLine =
    row.card.source === "manual_backfill"
      ? `${t.backfill}: ${row.card.paperRef ?? ""}`
      : row.card.signedAt
        ? `${t.signed}: ${fmtDateTime(row.card.signedAt, locale)}`
        : t.notSigned;

  return {
    kind: "scorecard",
    title: `${t.scorecard}`,
    subtitle: `${row.horseName}`,
    statusBadge: row.card.status === "firmata" || row.card.status === "validata"
      ? t.official
      : t.provisional,
    official: row.card.status === "validata",
    generatedAtIso: now.toISOString(),
    liveNote: t.liveNote,
    header: {
      event: row.event.name,
      class: row.cls.name,
      pattern: `${t.pattern} ${row.pattern.code}`,
      judge: judge ? officialName(judge) : "—",
    },
    maneuvers: maneuverDefs.map((m) => {
      const s = scoreByPos.get(m.position);
      return {
        position: m.position,
        label: locale === "en" && m.labelEn ? m.labelEn : m.labelIt,
        penalty: s && Number(s.penalty) > 0 ? `−${Number(s.penalty)}` : "",
        quality: s ? formatQuality(Number(s.quality)) : "",
      };
    }),
    runPenalty:
      Number(row.card.runPenalty) > 0 ? `−${Number(row.card.runPenalty)}` : "0",
    total:
      breakdown.outcome === "no_score"
        ? "NS"
        : breakdown.outcome === "score_0"
          ? "0"
          : breakdown.total!.toFixed(1),
    signatureLine,
  };
}

function formatQuality(q: number): string {
  if (q === 0) return "0";
  const abs = Math.abs(q).toString().replace("1.5", "1½").replace("0.5", "½");
  return (q > 0 ? "+" : "−") + abs;
}
