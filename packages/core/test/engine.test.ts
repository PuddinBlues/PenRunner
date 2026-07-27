import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  combineCards,
  computeCardScore,
  prepareClosure,
  prepareSignatureBatch,
  SCORING_ENGINE_VERSION,
  ScoringError,
  type CardBreakdown,
  type CardInput,
} from "../src/index.js";

function card(
  qualities: Array<number | null>,
  penalties: number[] = [],
  runPenalty = 0,
  special: CardInput["special"] = null,
): CardInput {
  return {
    maneuvers: qualities.map((q, i) => ({
      position: i + 1,
      quality: q,
      penalty: penalties[i] ?? 0,
    })),
    runPenalty,
    special,
  };
}

function scored(total: number): CardBreakdown {
  return {
    base: 70,
    qualitySum: 0,
    maneuverPenaltySum: 0,
    runPenalty: 0,
    total,
    outcome: "scored",
  };
}

describe("motore di scoring (BR-20..23)", () => {
  it("formula base: 70 + Σ quality − Σ penalità manovre − run penalty", () => {
    const b = computeCardScore(card([0.5, 1, -0.5], [0, 2, 0.5], 5));
    expect(b).toMatchObject({
      base: 70,
      qualitySum: 1,
      maneuverPenaltySum: 2.5,
      runPenalty: 5,
      total: 63.5,
      outcome: "scored",
    });
  });

  it("nessuna deriva float: mezzi punti sommati esattamente", () => {
    // 0.1 + 0.2 in float darebbe 0.30000000000000004: qui tutto è in mezzi
    const b = computeCardScore(card(Array(8).fill(0.5), Array(8).fill(0.5)));
    expect(b.total).toBe(70);
    expect(b.qualitySum).toBe(4);
  });

  it("BR-21: quality fuori scala o fuori passo rifiutata", () => {
    expect(() => computeCardScore(card([2]))).toThrow(ScoringError);
    expect(() => computeCardScore(card([-1.7]))).toThrow(/multiplo di 0.5/);
    expect(() => computeCardScore(card([0.25]))).toThrow(ScoringError);
  });

  it("BR-22: penalità negative o fuori passo rifiutate", () => {
    expect(() => computeCardScore(card([0], [-1]))).toThrow(/negativa/);
    expect(() => computeCardScore(card([0], [0.3]))).toThrow(/multiplo/);
    expect(() => computeCardScore(card([0], [0], -5))).toThrow(/negativa/);
  });

  it("completezza richiesta alla chiusura; no_score esonera", () => {
    expect(() =>
      computeCardScore(card([0.5, null]), { requireComplete: true }),
    ).toThrow(/voto qualità mancante/);
    const ns = computeCardScore(card([0.5, null], [], 0, "no_score"), {
      requireComplete: true,
    });
    expect(ns.total).toBeNull();
    expect(ns.outcome).toBe("no_score");
  });

  it("numero manovre del pattern rispettato", () => {
    expect(() =>
      computeCardScore(card([0, 0]), { expectedManeuvers: 7 }),
    ).toThrow(/attese 7 manovre/);
  });
});

describe("combinazione multi-giudice (BR-24)", () => {
  it("2 giudici: somma", () => {
    const r = combineCards([scored(70.5), scored(69)]);
    expect(r.total).toBe(139.5);
    expect(r.discardedIndexes).toEqual([]);
  });

  it("5 giudici: esclusi il più alto e il più basso, somma dei 3 centrali", () => {
    const r = combineCards([
      scored(70),
      scored(72),
      scored(68.5),
      scored(71),
      scored(70.5),
    ]);
    expect(r.discardedIndexes.sort()).toEqual([1, 2]); // 72 e 68.5
    expect(r.total).toBe(211.5); // 70 + 71 + 70.5
  });

  it("parità negli scarti: se ne esclude UNO solo", () => {
    const r = combineCards([
      scored(72),
      scored(72),
      scored(70),
      scored(69),
      scored(69),
    ]);
    expect(r.discardedIndexes).toHaveLength(2); // un 72 e un 69, non due
    expect(r.total).toBe(211); // 72 + 70 + 69
  });

  it("score_0 contribuisce 0; tutte no_score → run no_score; misto → segnalato", () => {
    const zero: CardBreakdown = { ...scored(0), outcome: "score_0" };
    const ns: CardBreakdown = { ...scored(0), total: null, outcome: "no_score" };
    expect(combineCards([zero, scored(70)]).total).toBe(70);
    expect(combineCards([ns, ns]).outcome).toBe("no_score");
    const mixed = combineCards([ns, scored(70)]);
    expect(mixed.mixedNoScore).toBe(true); // si segnala, non si decide
    expect(mixed.total).toBe(70);
  });
});

describe("chiusura e firma (BR-27): il totale si mostra, non si salva", () => {
  it("prepareClosure valida e restituisce il totale con la versione motore", () => {
    const d = prepareClosure(card([0.5, 0, -0.5], [0, 1, 0]), 3);
    expect(d.breakdown.total).toBe(69);
    expect(d.engineVersion).toBe(SCORING_ENGINE_VERSION);
  });

  it("prepareSignatureBatch: un totale visibile per OGNI carta del giudice", () => {
    const batch = prepareSignatureBatch([
      { ref: "a", card: card([0.5]), expectedManeuvers: 1 },
      { ref: "b", card: card([0], [], 5), expectedManeuvers: 1 },
    ]);
    expect(batch.map((x) => [x.ref, x.display.breakdown.total])).toEqual([
      ["a", 70.5],
      ["b", 65],
    ]);
  });
});

describe("vettori d'oro (score card reali e sintetici)", () => {
  const dir = fileURLToPath(new URL("./golden", import.meta.url));
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));

  it("almeno i vettori sintetici sono presenti", () => {
    expect(files.length).toBeGreaterThanOrEqual(4);
  });

  for (const file of files) {
    const vector = JSON.parse(
      readFileSync(`${dir}/${file}`, "utf-8"),
    ) as {
      description: string;
      card: CardInput;
      expected: Partial<CardBreakdown>;
    };
    it(`${file}: ${vector.description}`, () => {
      const b = computeCardScore(vector.card, {
        requireComplete: true,
        expectedManeuvers: vector.card.maneuvers.length,
      });
      expect(b).toMatchObject(vector.expected);
    });
  }
});
