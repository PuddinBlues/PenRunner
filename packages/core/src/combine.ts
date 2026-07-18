import { ScoringError, type CardBreakdown } from "./scoring.js";

// ---------------------------------------------------------------------------
// Combinazione multi-giudice (BR-24, da reference/scoring-rules.md):
// il punteggio mostrato è SEMPRE la SOMMA delle carte valide.
// Con 5 giudici: esclusi il punteggio più alto e il più basso (contano i 3
// centrali). A parità negli scarti (due massimi o due minimi uguali) se ne
// esclude UNO solo.
//
// Esiti speciali: una carta score_0 contribuisce 0 alla somma. Il caso misto
// "un giudice dà no_score, gli altri puntano" non è normato in modo chiuso:
// il combinatore lo SEGNALA (mixedNoScore) e non decide — la classifica
// (step 6) lo tratterà secondo la regola che verrà ratificata.
// ---------------------------------------------------------------------------

export interface CombineResult {
  /** somma delle carte contate (null se la run è no_score) */
  total: number | null;
  outcome: "scored" | "score_0" | "no_score";
  /** indici (nell'input) delle carte escluse dallo scarto alto/basso */
  discardedIndexes: number[];
  /** true se le carte mescolano no_score e punteggi: da segnalare, non decidere */
  mixedNoScore: boolean;
}

export function combineCards(cards: CardBreakdown[]): CombineResult {
  if (cards.length === 0) {
    throw new ScoringError("nessuna carta da combinare");
  }
  const noScores = cards.filter((c) => c.outcome === "no_score").length;
  if (noScores === cards.length) {
    return {
      total: null,
      outcome: "no_score",
      discardedIndexes: [],
      mixedNoScore: false,
    };
  }
  const mixedNoScore = noScores > 0;
  const numeric = cards
    .map((c, index) => ({ index, total: c.total }))
    .filter((c): c is { index: number; total: number } => c.total !== null);

  let counted = numeric;
  const discardedIndexes: number[] = [];
  if (cards.length === 5 && numeric.length === 5) {
    // scarta UN massimo e UN minimo (uno solo anche in caso di parità)
    const sorted = [...numeric].sort((a, b) => a.total - b.total);
    discardedIndexes.push(sorted[0]!.index, sorted[sorted.length - 1]!.index);
    counted = numeric.filter((c) => !discardedIndexes.includes(c.index));
  }

  const totalHalves = counted.reduce((s, c) => s + c.total * 2, 0);
  const allZero = counted.every((c) => c.total === 0);
  return {
    total: totalHalves / 2,
    outcome: allZero && counted.length > 0 ? "score_0" : "scored",
    discardedIndexes,
    mixedNoScore,
  };
}
