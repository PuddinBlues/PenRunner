import { describe, expect, it } from "vitest";
import {
  computeDragMarkers,
  computeGapWarnings,
  generateDraw,
  suggestRepair,
  type DrawCandidate,
  type Rng,
} from "../src/draw.js";
import { selfServeEntriesClosed } from "../src/services/cutoff.js";

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

describe("generazione draw (BR-19/BR-91)", () => {
  it("classe grande: il default 10 (BR-91) è rispettato", () => {
    const all = candidates([
      ["doppio", 2],
      ...Array.from({ length: 18 }, (_, i) => [`r${i}`, 1] as [string, number]),
    ]);
    for (let seed = 1; seed <= 5; seed++) {
      const res = generateDraw(all, { rng: lcg(seed) });
      expect(res.order).toHaveLength(20);
      expect(new Set(res.order).size).toBe(20); // permutazione valida
      expect(res.targetGap).toBe(10);
      for (const g of gapsOf(res.order, all)) expect(g).toBeGreaterThanOrEqual(10);
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
      targetGap: 10,
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

describe("editor del draw (BR-91): flag puntuali e 'sistema l'ordine'", () => {
  it("computeGapWarnings segnala CHI e DOVE, non solo che c'è un problema", () => {
    // stesso cavaliere alle posizioni 2 e 5 → 2 cavalli in mezzo
    const order: DrawCandidate[] = [
      { entryId: "e1", riderId: "a" },
      { entryId: "e2", riderId: "doppio" },
      { entryId: "e3", riderId: "b" },
      { entryId: "e4", riderId: "c" },
      { entryId: "e5", riderId: "doppio" },
    ];
    expect(computeGapWarnings(order, 10)).toEqual([
      { riderId: "doppio", positions: [2, 5], gap: 2, targetGap: 10 },
    ]);
    expect(computeGapWarnings(order, 2)).toEqual([]);
  });

  it("suggestRepair: ancorato all'ordine, muove POCHI binomi e risolve", () => {
    // 14 partenti, il doppio è back-to-back in testa: basta spostarne uno
    const all: DrawCandidate[] = [
      { entryId: "d1", riderId: "doppio" },
      { entryId: "d2", riderId: "doppio" },
      ...Array.from({ length: 12 }, (_, i) => ({
        entryId: `s${i}`,
        riderId: `r${i}`,
      })),
    ];
    const res = suggestRepair(all, 10);
    expect(new Set(res.order).size).toBe(14);
    expect(res.warnings).toEqual([]);
    expect(res.achievedGap).toBeGreaterThanOrEqual(10);
    // minime modifiche: molto meno di un rimescolamento totale
    expect(res.moved.length).toBeLessThanOrEqual(4);
    // deterministico: stessa lista, stessa proposta
    expect(suggestRepair(all, 10).order).toEqual(res.order);
  });

  it("suggestRepair su ordine già valido: nessuno spostamento", () => {
    const all: DrawCandidate[] = Array.from({ length: 6 }, (_, i) => ({
      entryId: `s${i}`,
      riderId: `r${i}`,
    }));
    const res = suggestRepair(all, 10);
    expect(res.moved).toEqual([]);
    expect(res.order).toEqual(all.map((c) => c.entryId));
  });

  it("suggestRepair impossibile: mai un errore, ordine intatto coi flag", () => {
    const all: DrawCandidate[] = [
      { entryId: "m1", riderId: "monopolista" },
      { entryId: "m2", riderId: "monopolista" },
      { entryId: "m3", riderId: "monopolista" },
    ];
    const res = suggestRepair(all, 10);
    expect(res.order).toHaveLength(3);
    expect(res.warnings.length).toBeGreaterThanOrEqual(1);
  });
});

describe("cut-off self-serve (BR-90): parametro evento, Europe/Rome", () => {
  const ev = {
    startDate: "2030-06-15",
    endDate: "2030-06-16",
    entryChangeCutoff: "18:00",
  };
  // 17:59 Rome della vigilia (CEST, UTC+2) → aperto
  it("prima del cut-off della vigilia: aperto", () => {
    expect(selfServeEntriesClosed(ev, new Date("2030-06-14T15:59:00Z"))).toBe(false);
  });
  it("dal cut-off della vigilia: chiuso", () => {
    expect(selfServeEntriesClosed(ev, new Date("2030-06-14T16:00:00Z"))).toBe(true);
  });
  it("durante l'evento: chiuso", () => {
    expect(selfServeEntriesClosed(ev, new Date("2030-06-15T10:00:00Z"))).toBe(true);
  });
  it("a evento finito: irrilevante (aperto per lo storico)", () => {
    expect(selfServeEntriesClosed(ev, new Date("2030-06-18T10:00:00Z"))).toBe(false);
  });
  it("una settimana prima: aperto", () => {
    expect(selfServeEntriesClosed(ev, new Date("2030-06-07T10:00:00Z"))).toBe(false);
  });
  it("il cut-off è un parametro: alle 20:00 la sera resta aperta più a lungo", () => {
    const late = { ...ev, entryChangeCutoff: "20:00" };
    expect(selfServeEntriesClosed(late, new Date("2030-06-14T16:30:00Z"))).toBe(false);
    expect(selfServeEntriesClosed(late, new Date("2030-06-14T18:00:00Z"))).toBe(true);
  });
});

describe("marker di drag a POSIZIONI FISSE (BR-51, validata col giudice)", () => {
  const rows = (n: number, scratched: number[] = []) =>
    Array.from({ length: n }, (_, i) => ({
      drawNumber: i + 1,
      effective: !scratched.includes(i + 1),
    }));

  it("12 posizioni, drag ogni 5 → dopo la 5 e la 10", () => {
    expect(computeDragMarkers(rows(12), 5)).toEqual([5, 10]);
  });

  it("esattamente 10: il drag dopo l'ultima non si mostra", () => {
    expect(computeDragMarkers(rows(10), 5)).toEqual([5]);
  });

  it("lo scratch NON sposta il confine: entrano in 4, il trattore resta lì", () => {
    // scratch del n° 3: il blocco si accorcia, i marker restano 5 e 10
    expect(computeDragMarkers(rows(12, [3]), 5)).toEqual([5, 10]);
  });

  it("nemmeno lo scratch dopo il confine muove i marker", () => {
    expect(computeDragMarkers(rows(12, [7]), 5)).toEqual([5, 10]);
  });

  it("l'intervallo è impostazione di gara: con 7 il marker cade dopo la 7", () => {
    expect(computeDragMarkers(rows(15), 7)).toEqual([7, 14]);
  });
});
