// ---------------------------------------------------------------------------
// Motore di scoring (BR-20..23). Puro e senza dipendenze: gira identico su
// client (offline) e server. Stesso input → stesso risultato, ovunque.
//
// Non negoziabili:
// - lo score parte da 70: 70 + Σ(quality) − Σ(penalty manovre) − run_penalty;
// - quality in [−1.5, +1.5] a passi di 0.5;
// - la penalità di manovra è UN TOTALE UNICO inserito dallo scribe (BR-22):
//   il motore non conosce tipi di penalità;
// - il totale calcolato si MOSTRA (chiusura, firma), non si salva mai.
//
// Aritmetica in mezzi punti (interi) per eliminare ogni deriva float.
// ---------------------------------------------------------------------------

export type SpecialOutcome = "score_0" | "no_score";

export interface ManeuverScoreInput {
  /** posizione della manovra nel pattern (1-based), per messaggi d'errore */
  position: number;
  /** voto qualità: −1.5 … +1.5 a passi di 0.5; null = non ancora votata */
  quality: number | null;
  /** totale penalità della manovra (≥ 0, passi di 0.5) */
  penalty: number;
}

export interface CardInput {
  maneuvers: ManeuverScoreInput[];
  runPenalty: number;
  special: SpecialOutcome | null;
}

export interface CardBreakdown {
  base: 70;
  qualitySum: number;
  maneuverPenaltySum: number;
  runPenalty: number;
  /** null per no_score (fuori classifica); 0 per score_0 (in classifica) */
  total: number | null;
  outcome: "scored" | SpecialOutcome;
}

export class ScoringError extends Error {}

function toHalves(value: number, what: string): number {
  const halves = value * 2;
  if (!Number.isFinite(halves) || !Number.isInteger(halves)) {
    throw new ScoringError(`${what}: ${value} non è un multiplo di 0.5`);
  }
  return halves;
}

export function validateQuality(quality: number, position: number): void {
  const halves = toHalves(quality, `manovra ${position}: quality`);
  if (halves < -3 || halves > 3) {
    throw new ScoringError(
      // BR-21: scala qualità — il codice resta nel commento, mai a video
      `manovra ${position}: quality ${quality} fuori da [−1.5, +1.5]`,
    );
  }
}

export function validatePenalty(penalty: number, what: string): void {
  toHalves(penalty, what);
  if (penalty < 0) {
    // BR-22: penalità mai negative
    throw new ScoringError(`${what}: ${penalty} negativa`);
  }
}

export interface ComputeOptions {
  /** numero manovre atteso dal pattern; se dato, dev'essere rispettato */
  expectedManeuvers?: number;
  /**
   * true (chiusura/firma): tutte le manovre devono essere votate — tranne
   * per no_score, che esonera dalla completezza. held_for_review NON esonera:
   * una carta si chiude solo con UN valore deciso per ogni manovra (BR-29).
   */
  requireComplete?: boolean;
}

export function computeCardScore(
  card: CardInput,
  opts: ComputeOptions = {},
): CardBreakdown {
  if (
    opts.expectedManeuvers !== undefined &&
    card.maneuvers.length !== opts.expectedManeuvers
  ) {
    throw new ScoringError(
      `attese ${opts.expectedManeuvers} manovre, trovate ${card.maneuvers.length}`,
    );
  }
  validatePenalty(card.runPenalty, "penalità di run");

  let qualityHalves = 0;
  let penaltyHalves = 0;
  for (const m of card.maneuvers) {
    if (m.quality !== null) {
      validateQuality(m.quality, m.position);
      qualityHalves += m.quality * 2;
    } else if (opts.requireComplete && card.special !== "no_score") {
      throw new ScoringError(`manovra ${m.position}: voto qualità mancante`);
    }
    validatePenalty(m.penalty, `manovra ${m.position}: penalità`);
    penaltyHalves += m.penalty * 2;
  }

  const qualitySum = qualityHalves / 2;
  const maneuverPenaltySum = penaltyHalves / 2;
  const outcome = card.special ?? "scored";
  const total =
    outcome === "no_score"
      ? null
      : outcome === "score_0"
        ? 0
        : (140 + qualityHalves - penaltyHalves - card.runPenalty * 2) / 2;

  return {
    base: 70,
    qualitySum,
    maneuverPenaltySum,
    runPenalty: card.runPenalty,
    total,
    outcome,
  };
}
