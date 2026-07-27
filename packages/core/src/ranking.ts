// ---------------------------------------------------------------------------
// Classifica (BR-24, BR-29, BR-30, BR-31): vista DERIVATA, mai memorizzata.
// - ordinamento per total decrescente;
// - pari merito = posizioni condivise (1-2-2-4); la parità al PRIMO posto è
//   flaggata: la risoluzione (run-off entro 10' o co-champion) è umana;
// - score_0: in classifica in fondo, MAI eligibile ai piazzamenti a premio
//   (BR-31 precisata — vincola il payout);
// - no_score: fuori classifica (elencato a parte);
// - run in review (BR-29): riga presente, "Score in review" al posto del
//   numero (etichetta inglese in entrambe le lingue, BR-61).
// ---------------------------------------------------------------------------

export interface RankingInput<Ref> {
  ref: Ref;
  /** pending = non ancora corsa/chiusa; in_review = BR-29 */
  state: "scored" | "in_review" | "pending";
  outcome: "scored" | "score_0" | "no_score";
  /** somma delle carte (combineCards); null per no_score/pending/in_review */
  total: number | null;
  /** true finché la run non è pubblicata/ufficiale */
  provisional: boolean;
}

export interface RankingRow<Ref> {
  ref: Ref;
  /** null per in_review/pending/no_score */
  position: number | null;
  sharedPosition: boolean;
  total: number | null;
  outcome: "scored" | "score_0" | "no_score";
  state: "scored" | "in_review" | "pending";
  /** BR-31: eligibilità ai piazzamenti a premio (mai per score_0/no_score) */
  prizeEligible: boolean;
  provisional: boolean;
  /** etichetta display al posto del numero, se presente */
  label: "Score in review" | null;
}

export interface RankingResult<Ref> {
  rows: RankingRow<Ref>[];
  excluded: RankingRow<Ref>[]; // no_score: fuori classifica
  /** parità al 1° posto: risoluzione umana (run-off / co-champion) */
  firstPlaceTie: boolean;
}

export function computeRanking<Ref>(
  input: RankingInput<Ref>[],
): RankingResult<Ref> {
  const scored = input.filter(
    (r) => r.state === "scored" && r.outcome !== "no_score",
  );
  // score_0 in fondo: ordiniamo prima i punteggi reali, poi gli score_0
  const ranked = [...scored].sort((a, b) => {
    const aZero = a.outcome === "score_0" ? 1 : 0;
    const bZero = b.outcome === "score_0" ? 1 : 0;
    if (aZero !== bZero) return aZero - bZero;
    return (b.total ?? 0) - (a.total ?? 0);
  });

  const rows: RankingRow<Ref>[] = [];
  let position = 0;
  let prevKey: string | null = null;
  ranked.forEach((r, index) => {
    const key = `${r.outcome === "score_0" ? "zero" : "n"}:${r.total}`;
    if (key !== prevKey) position = index + 1;
    prevKey = key;
    rows.push({
      ref: r.ref,
      position,
      sharedPosition: false, // rifinito sotto
      total: r.total,
      outcome: r.outcome,
      state: r.state,
      prizeEligible: r.outcome === "scored", // BR-31: mai score_0/no_score
      provisional: r.provisional,
      label: null,
    });
  });
  for (const row of rows) {
    row.sharedPosition =
      rows.filter((x) => x.position === row.position).length > 1;
  }

  // in review e pending: presenti senza posizione, in coda alla lista
  for (const r of input.filter((x) => x.state !== "scored")) {
    rows.push({
      ref: r.ref,
      position: null,
      sharedPosition: false,
      total: null,
      outcome: r.outcome,
      state: r.state,
      prizeEligible: false,
      provisional: true,
      label: r.state === "in_review" ? "Score in review" : null,
    });
  }

  const excluded: RankingRow<Ref>[] = input
    .filter((r) => r.state === "scored" && r.outcome === "no_score")
    .map((r) => ({
      ref: r.ref,
      position: null,
      sharedPosition: false,
      total: null,
      outcome: "no_score",
      state: r.state,
      prizeEligible: false,
      provisional: r.provisional,
      label: null,
    }));

  const firstPlaceTie =
    rows.filter((r) => r.position === 1 && r.outcome === "scored").length > 1;

  return { rows, excluded, firstPlaceTie };
}

// ---------------------------------------------------------------------------
// Ufficialità (BR-42): i risultati live sono provvisori fino a +30 minuti
// dall'ultimo percorso della sezione. SEMPLIFICAZIONE DICHIARATA (MVP):
// sezione ≈ classe — se la sezione regolamentare è il blocco di giornata,
// la finestra per classe potrebbe chiudersi prima del dovuto; rivisitabile
// con l'entità schedule (domanda in lista per giudice/steward).
// ---------------------------------------------------------------------------

export const OFFICIAL_WINDOW_MS = 30 * 60 * 1000;

export function officiality(
  allRunsPublished: boolean,
  lastRunClosedAt: Date | null,
  now: Date,
): { official: boolean; officialAt: Date | null } {
  if (!lastRunClosedAt) return { official: false, officialAt: null };
  const officialAt = new Date(lastRunClosedAt.getTime() + OFFICIAL_WINDOW_MS);
  return {
    official: allRunsPublished && now.getTime() >= officialAt.getTime(),
    officialAt,
  };
}
