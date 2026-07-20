import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  combineCards,
  computeCardScore,
  type CardBreakdown,
  type CardInput,
  type SpecialOutcome,
} from "../src/index.js";

// ---------------------------------------------------------------------------
// Vettori d'oro REALI (reference/golden-scoring/): score card verificate al
// mezzo punto. Parità competitiva con ShowManager (EuroFuturity 2026) e con
// le card cartacee firmate (Lombardia 2025). Chiudono l'assunzione n°2 del
// consuntivo rischi (motore validato su numeri veri) per la parte scoring.
// ---------------------------------------------------------------------------

const dir = fileURLToPath(
  new URL("../../../reference/golden-scoring", import.meta.url),
);
const readVec = (name: string) =>
  JSON.parse(readFileSync(`${dir}/${name}`, "utf-8"));

interface RawManeuver {
  quality: number;
  penalty: number;
}
interface CardVector {
  description: string;
  maneuvers: RawManeuver[];
  runPenalty: number;
  special: SpecialOutcome | "scratch" | null;
  expected: { total?: number; outcome: string };
}

// Uno scratch non è un esito di punteggio (è lo stato dell'iscrizione,
// ritirata): al motore è indistinguibile da un no_score — nessun totale,
// fuori classifica. La distinzione ritiro-vs-squalifica vive sulla entry.
function toCardInput(v: CardVector): CardInput {
  const special: SpecialOutcome | null =
    v.special === "scratch" ? "no_score" : v.special;
  return {
    maneuvers: v.maneuvers.map((m, i) => ({
      position: i + 1,
      quality: m.quality,
      penalty: m.penalty,
    })),
    runPenalty: v.runPenalty,
    special,
  };
}

function checkCardVector(v: CardVector) {
  const b = computeCardScore(toCardInput(v));
  expect(b.outcome).toBe(v.expected.outcome);
  if (v.expected.total !== undefined) {
    expect(b.total).toBe(v.expected.total);
  } else {
    expect(b.total).toBeNull(); // scratch / no_score: nessun totale
  }
}

describe("parità competitiva ShowManager (EuroFuturity 2026, Pattern 10)", () => {
  const vectors = readVec("futurity_showmanager_clean.json") as CardVector[];
  it("13 vettori dall'output ufficiale", () => {
    expect(vectors.length).toBe(13);
  });
  for (const v of vectors) {
    it(v.description, () => checkCardVector(v));
  }
});

describe("score card cartacee firmate (Lombardia 2025)", () => {
  const vectors = readVec("scorecards_reali_foto.json") as CardVector[];
  for (const v of vectors) {
    it(v.description, () => checkCardVector(v));
  }
});

describe("percorso penalità di manovra su card reali (EuroFuturity 2026)", () => {
  const vectors = readVec("futurity_penalita_manovra.json") as CardVector[];
  it("37 vettori con penalità di manovra (fino a 4 su una carta)", () => {
    expect(vectors.length).toBe(37);
    // esercitano davvero il ramo penalità: almeno una card con 4 penalità
    const maxPen = Math.max(
      ...vectors.map((v) => v.maneuvers.filter((m) => m.penalty > 0).length),
    );
    expect(maxPen).toBe(4);
  });
  for (const v of vectors) {
    it(v.description, () => checkCardVector(v));
  }
});

// --- BR-24 (multi-giudice, esclude alto/basso) -----------------------------

interface Br24Cards {
  description: string;
  cards: { maneuvers: RawManeuver[]; runPenalty: number }[];
  expected: { perCard: number[]; kept: number[]; runTotalBR24: number };
}
interface Br24Totals {
  description: string;
  totals: number[];
  expected: { kept: number[]; runTotalBR24: number };
}

function breakdownFromTotal(total: number): CardBreakdown {
  return {
    base: 70,
    qualitySum: 0,
    maneuverPenaltySum: 0,
    runPenalty: 0,
    total,
    outcome: "scored",
  };
}

describe("BR-24: somma con scarto alto/basso a 5 giudici", () => {
  const vectors = readVec("multigiudice_br24.json") as Array<
    Br24Cards | Br24Totals
  >;

  it("il caso critico: parità sul minimo esclude UNO solo → run 201.0", () => {
    const v = vectors.find((x) => "cards" in x) as Br24Cards;
    // ogni carta ricalcolata dal motore combacia col totale della card reale
    const breakdowns = v.cards.map((c) =>
      computeCardScore({
        maneuvers: c.maneuvers.map((m, i) => ({
          position: i + 1,
          quality: m.quality,
          penalty: m.penalty,
        })),
        runPenalty: c.runPenalty,
        special: null,
      }),
    );
    expect(breakdowns.map((b) => b.total)).toEqual(v.expected.perCard);

    const combined = combineCards(breakdowns);
    expect(combined.total).toBe(v.expected.runTotalBR24); // 201.0
    // i tenuti (esclusi un minimo e il massimo) coincidono
    const kept = breakdowns
      .map((b, i) => ({ total: b.total!, i }))
      .filter((x) => !combined.discardedIndexes.includes(x.i))
      .map((x) => x.total)
      .sort((a, b) => a - b);
    expect(kept).toEqual(v.expected.kept);
  });

  it("Futurity DRAW 1 su totali ufficiali → run 206.5", () => {
    const v = vectors.find((x) => "totals" in x) as Br24Totals;
    const combined = combineCards(v.totals.map(breakdownFromTotal));
    expect(combined.total).toBe(v.expected.runTotalBR24); // 206.5
  });
});
