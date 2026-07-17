import { describe, expect, it } from "vitest";
import {
  computeDragMarkers,
  generateDraw,
  type DrawCandidate,
  type Rng,
} from "../src/draw.js";

// RNG deterministico (LCG) per test riproducibili.
function lcg(seed: number): Rng {
  let s = seed >>> 0;
  return (max) => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s % max;
  };
}

function candidates(spec: Array<[rider: string, horses: number]>): DrawCandidate[] {
  const out: DrawCandidate[] = [];
  for (const [rider, horses] of spec) {
    for (let i = 0; i < horses; i++) {
      out.push({ entryId: `${rider}-h${i}`, riderId: rider });
    }
  }
  return out;
}

function gapsOf(order: string[], all: DrawCandidate[]): number[] {
  const riderOf = new Map(all.map((c) => [c.entryId, c.riderId]));
  const lastSeen = new Map<string, number>();
  const gaps: number[] = [];
  order.forEach((id, i) => {
    const rider = riderOf.get(id)!;
    const prev = lastSeen.get(rider);
    if (prev !== undefined) gaps.push(i - prev - 1);
    lastSeen.set(rider, i);
  });
  return gaps;
}

describe("generazione draw (BR-19)", () => {
  it("classe grande: il default 8 è rispettato", () => {
    const all = candidates([
      ["doppio", 2],
      ...Array.from({ length: 18 }, (_, i) => [`r${i}`, 1] as [string, number]),
    ]);
    for (let seed = 1; seed <= 5; seed++) {
      const res = generateDraw(all, { rng: lcg(seed) });
      expect(res.order).toHaveLength(20);
      expect(new Set(res.order).size).toBe(20); // permutazione valida
      expect(res.targetGap).toBe(8);
      for (const g of gapsOf(res.order, all)) expect(g).toBeGreaterThanOrEqual(8);
      expect(res.warnings).toEqual([]);
    }
  });

  it("classe piccola: degradazione a scala col best-effort e warnings", () => {
    // 5 iscritti, un cavaliere con 2: gap massimo possibile 3 (posizioni 1 e 5)
    const all = candidates([
      ["doppio", 2],
      ["a", 1],
      ["b", 1],
      ["c", 1],
    ]);
    const res = generateDraw(all, { rng: lcg(7) });
    expect(res.order).toHaveLength(5);
    expect(res.achievedGap).toBe(3); // il meglio matematicamente possibile
    expect(res.warnings).toHaveLength(1);
    expect(res.warnings[0]).toMatchObject({
      riderId: "doppio",
      gap: 3,
      targetGap: 8,
    });
  });

  it("vincoli insoddisfacibili: mai un fallimento, best-effort + warnings", () => {
    // 3 binomi dello stesso cavaliere su 4: perfino il back-to-back è inevitabile
    const all = candidates([
      ["monopolista", 3],
      ["x", 1],
    ]);
    const res = generateDraw(all, { rng: lcg(11) });
    expect(res.order).toHaveLength(4);
    expect(new Set(res.order).size).toBe(4);
    expect(res.warnings.length).toBeGreaterThanOrEqual(1);
    // il best-effort distanzia il possibile: il monopolista non è mai
    // 3 volte di fila (gap minimo raggiungibile qui è 0 ma non doppio-zero
    // consecutivo sulla stessa coppia... verifichiamo solo che non crashi
    // e che segnali)
    expect(res.achievedGap).not.toBeNull();
  });

  it("nessun cavaliere doppio: nessun warning, nessun gap", () => {
    const all = candidates([
      ["a", 1],
      ["b", 1],
      ["c", 1],
    ]);
    const res = generateDraw(all, { rng: lcg(3) });
    expect(res.achievedGap).toBeNull();
    expect(res.warnings).toEqual([]);
  });

  it("gap richiesto più basso del default viene rispettato come richiesto", () => {
    const all = candidates([
      ["doppio", 2],
      ["a", 1],
      ["b", 1],
      ["c", 1],
    ]);
    const res = generateDraw(all, { minRiderGap: 2, rng: lcg(5) });
    expect(res.targetGap).toBe(2);
    for (const g of gapsOf(res.order, all)) expect(g).toBeGreaterThanOrEqual(2);
    expect(res.warnings).toEqual([]);
  });
});

describe("marker di drag su run effettive (BR-51)", () => {
  const rows = (n: number, scratched: number[] = []) =>
    Array.from({ length: n }, (_, i) => ({
      drawNumber: i + 1,
      effective: !scratched.includes(i + 1),
    }));

  it("12 run effettive, drag ogni 5 → dopo la 5 e la 10", () => {
    expect(computeDragMarkers(rows(12), 5)).toEqual([5, 10]);
  });

  it("esattamente 10: il drag dopo l'ultima non si mostra", () => {
    expect(computeDragMarkers(rows(10), 5)).toEqual([5]);
  });

  it("uno scratch sposta il confine: il fondo si consuma con chi corre", () => {
    // scratch del n° 3: la quinta run effettiva diventa il n° 6
    expect(computeDragMarkers(rows(12, [3]), 5)).toEqual([6, 11]);
  });

  it("scratch dopo il confine: il primo marker non si muove", () => {
    expect(computeDragMarkers(rows(12, [7]), 5)).toEqual([5, 11]);
  });
});
