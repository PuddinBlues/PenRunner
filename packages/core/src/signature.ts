import { SCORING_ENGINE_VERSION } from "./version.js";
import {
  computeCardScore,
  type CardBreakdown,
  type CardInput,
} from "./scoring.js";

// ---------------------------------------------------------------------------
// BR-27: chiusura ≠ firma.
// - prepareClosure: a fine run lo scribe CHIUDE la carta — completezza
//   validata, totale MOSTRATO (è l'annuncio: alimenta il live come
//   provvisorio). Il totale non si salva mai: si ricalcola sempre.
// - prepareSignatureBatch: la firma ufficializza, tipicamente in batch a
//   fine classe — il giudice rivede l'elenco delle proprie carte con OGNI
//   totale visibile e firma (signed_at e tratto per carta, dal frontend).
// ---------------------------------------------------------------------------

export interface ClosureDisplay {
  breakdown: CardBreakdown;
  engineVersion: string;
}

export function prepareClosure(
  card: CardInput,
  expectedManeuvers: number,
): ClosureDisplay {
  const breakdown = computeCardScore(card, {
    expectedManeuvers,
    requireComplete: true,
  });
  return { breakdown, engineVersion: SCORING_ENGINE_VERSION };
}

export interface SignatureBatchItem<Ref> {
  ref: Ref;
  display: ClosureDisplay;
}

/** L'elenco che il giudice rivede e firma: un totale visibile per carta. */
export function prepareSignatureBatch<Ref>(
  cards: Array<{ ref: Ref; card: CardInput; expectedManeuvers: number }>,
): Array<SignatureBatchItem<Ref>> {
  return cards.map(({ ref, card, expectedManeuvers }) => ({
    ref,
    display: prepareClosure(card, expectedManeuvers),
  }));
}
