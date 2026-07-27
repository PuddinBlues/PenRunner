import { describe, expect, it } from "vitest";
import {
  computeEta,
  computeRanking,
  observedCadenceSeconds,
  officiality,
  type RankingInput,
} from "../src/index.js";

function row(
  ref: string,
  total: number | null,
  outcome: "scored" | "score_0" | "no_score" = "scored",
  state: "scored" | "in_review" | "pending" = "scored",
): RankingInput<string> {
  return { ref, state, outcome, total, provisional: true };
}

describe("classifica derivata (BR-24/29/30/31)", () => {
  it("ordina per somma decrescente; score_0 in fondo ma presente, MAI prize-eligible", () => {
    const r = computeRanking([
      row("a", 141.5),
      row("b", 139),
      row("zero", 0, "score_0"),
      row("c", 140),
    ]);
    expect(r.rows.map((x) => [x.ref, x.position])).toEqual([
      ["a", 1],
      ["c", 2],
      ["b", 3],
      ["zero", 4],
    ]);
    expect(r.rows.find((x) => x.ref === "zero")).toMatchObject({
      prizeEligible: false, // BR-31 precisata: vincola il payout (step 7)
      outcome: "score_0",
    });
    expect(r.rows.filter((x) => x.ref !== "zero").every((x) => x.prizeEligible)).toBe(true);
  });

  it("score_0 sta sotto anche a un punteggio 0-equivalente e a totali bassi", () => {
    const r = computeRanking([row("basso", 61.5), row("zero", 0, "score_0")]);
    expect(r.rows.map((x) => x.ref)).toEqual(["basso", "zero"]);
  });

  it("no_score è fuori classifica, elencato a parte", () => {
    const r = computeRanking([row("a", 140), row("nq", null, "no_score")]);
    expect(r.rows.map((x) => x.ref)).toEqual(["a"]);
    expect(r.excluded.map((x) => x.ref)).toEqual(["nq"]);
    expect(r.excluded[0]!.prizeEligible).toBe(false);
  });

  it("pari merito: posizioni condivise 1-2-2-4; al 1° posto è flaggato (run-off umano)", () => {
    const shared = computeRanking([
      row("a", 142),
      row("b", 140),
      row("c", 140),
      row("d", 139),
    ]);
    expect(shared.rows.map((x) => [x.ref, x.position, x.sharedPosition])).toEqual([
      ["a", 1, false],
      ["b", 2, true],
      ["c", 2, true],
      ["d", 4, false],
    ]);
    expect(shared.firstPlaceTie).toBe(false);

    const tieTop = computeRanking([row("a", 142), row("b", 142), row("c", 140)]);
    expect(tieTop.firstPlaceTie).toBe(true);
    expect(tieTop.rows[0]!.position).toBe(1);
    expect(tieTop.rows[1]!.position).toBe(1);
  });

  it("BR-29: run in review presente con l'etichetta al posto del numero", () => {
    const r = computeRanking([row("a", 140), row("rev", null, "scored", "in_review")]);
    const rev = r.rows.find((x) => x.ref === "rev")!;
    expect(rev.position).toBeNull();
    expect(rev.label).toBe("Score in review"); // inglese in entrambe le lingue
  });
});

describe("ufficialità (BR-42, sezione ≈ classe)", () => {
  const closed = new Date("2026-09-01T15:00:00Z");
  it("provvisoria entro i 30 minuti o senza pubblicazione completa", () => {
    expect(
      officiality(true, closed, new Date("2026-09-01T15:29:59Z")).official,
    ).toBe(false);
    expect(
      officiality(false, closed, new Date("2026-09-01T16:00:00Z")).official,
    ).toBe(false);
    expect(officiality(true, null, new Date()).official).toBe(false);
  });
  it("ufficiale a +30' con tutte le run pubblicate", () => {
    const res = officiality(true, closed, new Date("2026-09-01T15:30:00Z"));
    expect(res.official).toBe(true);
    expect(res.officialAt?.toISOString()).toBe("2026-09-01T15:30:00.000Z");
  });
});

describe("ETA derivata (BR-50..52)", () => {
  const rows = (n: number, opts: { scratched?: number[]; done?: number } = {}) =>
    Array.from({ length: n }, (_, i) => ({
      ref: `e${i + 1}`,
      drawNumber: i + 1,
      effective: !(opts.scratched ?? []).includes(i + 1),
      done: i + 1 <= (opts.done ?? 0),
    }));

  it("slot e drag dai default evento: 10 cavalli/ora", () => {
    const eta = computeEta(rows(12, { done: 0 }), 1000_000, {
      slotSeconds: 270,
      dragEveryNRuns: 5,
      dragSeconds: 420,
      observedStartsMs: [],
    });
    const e6 = eta.find((x) => x.ref === "e6")!;
    // 6 slot + 1 drag (dopo la 5ª): 6×270 + 420 = 2040s
    expect(e6.etaMs).toBe(2040 * 1000);
    expect(e6.mode).toBe("live");
  });

  it("senza àncora: modalità 'da programma', mai un orario promesso", () => {
    const eta = computeEta(rows(5), null, {
      slotSeconds: 270,
      dragEveryNRuns: 5,
      dragSeconds: 420,
      observedStartsMs: [],
    });
    expect(eta.every((x) => x.etaMs === null && x.mode === "schedule")).toBe(true);
    expect(eta.find((x) => x.ref === "e3")!.runsBefore).toBe(2);
  });

  it("lo scratch accorcia la stima (escluso dal conteggio, BR-53)", () => {
    const params = {
      slotSeconds: 270,
      dragEveryNRuns: 5,
      dragSeconds: 420,
      observedStartsMs: [],
    };
    const with12 = computeEta(rows(12, { done: 2 }), 0, params);
    const withScratch = computeEta(
      rows(12, { done: 2, scratched: [4] }),
      0,
      params,
    );
    const before = with12.find((x) => x.ref === "e8")!.etaMs!;
    const after = withScratch.find((x) => x.ref === "e8")!.etaMs!;
    expect(after).toBeLessThan(before);
  });

  it("BR-51: lo scratch accorcia gli slot ma NON sposta i confini di drag", () => {
    const params = {
      slotSeconds: 270,
      dragEveryNRuns: 5,
      dragSeconds: 420,
      observedStartsMs: [],
    };
    // scratch del n°3: il n°6 resta OLTRE il confine fisso (dopo il n°5),
    // quindi paga comunque 1 drag — ma solo 5 slot (4 run prima + la sua).
    const eta = computeEta(rows(12, { scratched: [3] }), 0, params);
    const e6 = eta.find((x) => x.ref === "e6")!;
    expect(e6.runsBefore).toBe(4);
    expect(e6.etaMs).toBe((5 * 270 + 420) * 1000);
    // il n°5 è PRIMA del confine: nessun drag, 4 slot
    const e5 = eta.find((x) => x.ref === "e5")!;
    expect(e5.etaMs).toBe(4 * 270 * 1000);
  });

  it("la cadenza osservata sostituisce lo slot di default (BR-52)", () => {
    // 4 start a distanza di 300s → cadenza 300
    const starts = [0, 300_000, 600_000, 900_000];
    expect(observedCadenceSeconds(starts)).toBe(300);
    const eta = computeEta(rows(10, { done: 4 }), 900_000, {
      slotSeconds: 270,
      dragEveryNRuns: 5,
      dragSeconds: 420,
      observedStartsMs: starts,
    });
    const e6 = eta.find((x) => x.ref === "e6")!;
    // 2 slot da 300 (e5, e6) + il drag dopo la 5ª effettiva
    expect(e6.etaMs).toBe((2 * 300 + 420) * 1000);
  });

  it("gli intervalli anomali (pause lunghe) non inquinano la cadenza", () => {
    // un buco di 2 ore in mezzo viene scartato dalla media
    expect(observedCadenceSeconds([0, 280_000, 7_480_000, 7_760_000])).toBe(280);
  });
});
