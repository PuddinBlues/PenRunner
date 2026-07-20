import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  computePayout,
  computePurse,
  largestRemainder,
  selectPaybackBand,
  splitEqually,
  type PaybackBand,
  type Placement,
} from "../src/index.js";

// La tabella Payback A dal file di dominio (validata: ogni colonna = 100%).
const paybackA = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../../reference/payback-schedules.json", import.meta.url)),
    "utf-8",
  ),
).schedule_a.table as PaybackBand[];

describe("purse (montepremi, formula assunta)", () => {
  it("iscrizioni + AM − trofei − 20%, con componenti esposti", () => {
    const p = computePurse({
      confirmedEntries: 10,
      entryFeeCents: 3000,
      addedMoneyCents: 50000,
      trophyCostCents: 7500,
    });
    expect(p).toEqual({
      entryFeesCents: 30000,
      addedMoneyCents: 50000,
      trophyDeductionCents: 7500,
      orgExpenseCents: 6000,
      purseCents: 66500,
    });
  });

  it("meno di 4 partecipanti: il trofeo non si detrae (Handbook)", () => {
    const p = computePurse({
      confirmedEntries: 3,
      entryFeeCents: 3000,
      addedMoneyCents: 0,
      trophyCostCents: 7500,
    });
    expect(p.trophyDeductionCents).toBe(0);
    expect(p.purseCents).toBe(9000 - 1800); // 3×30 − 20%
  });
});

describe("selezione fascia Payback A", () => {
  it("legge le fasce 1, 2-5, 6-9, … e 61+", () => {
    expect(selectPaybackBand(paybackA, 1).places_paid).toBe(1);
    expect(selectPaybackBand(paybackA, 5).places_paid).toBe(2);
    expect(selectPaybackBand(paybackA, 7).places_paid).toBe(3);
    expect(selectPaybackBand(paybackA, 12).places_paid).toBe(4);
    expect(selectPaybackBand(paybackA, 200).horses_entered).toBe("61+");
  });

  it("la fascia si sceglie sui cavalli confermati, scratch inclusi (BR-33)", () => {
    // 7 confermati di cui 2 ritirati → resta fascia 6-9 (scratch inclusi)
    expect(selectPaybackBand(paybackA, 7).places_paid).toBe(3);
  });
});

describe("ripartizione e quadratura", () => {
  it("largest remainder: la somma torna ESATTA anche con purse 'difficili'", () => {
    // purse primo, percentuali con decimali (fascia 37-40)
    const band = selectPaybackBand(paybackA, 38);
    for (const purse of [99991, 100003, 1, 7, 123457, 500001]) {
      const amounts = largestRemainder(
        purse,
        Array.from({ length: band.places_paid }, (_, i) => band.percentages[String(i + 1)] ?? 0),
      );
      expect(amounts.reduce((a, b) => a + b, 0)).toBe(purse); // nessun centesimo perso
      expect(amounts.every((a) => a >= 0)).toBe(true);
    }
  });

  it("splitEqually preserva il totale su divisioni non intere", () => {
    expect(splitEqually(38500, 2)).toEqual([19250, 19250]);
    expect(splitEqually(10001, 3)).toEqual([3334, 3334, 3333]);
    expect(splitEqually(10001, 3).reduce((a, b) => a + b, 0)).toBe(10001);
  });

  it("INVARIANTE: distribuito + non_distribuito = purse, su casi avversari", () => {
    const band = selectPaybackBand(paybackA, 20); // 6 posti
    for (const purse of [1, 999999937, 33, 100000, 2, 7777]) {
      for (const eligible of [0, 1, 3, 6, 8]) {
        const placements: Placement<string>[] = Array.from(
          { length: eligible },
          (_, i) => ({ rank: i + 1, refs: [`e${i}`] }),
        );
        const r = computePayout({ purseCents: purse, band, placements });
        expect(r.distributedCents + r.undistributedCents).toBe(purse);
        const perRefSum = r.placements.reduce(
          (s, p) => s + p.perRefCents.reduce((a, b) => a + b, 0),
          0,
        );
        expect(perRefSum).toBe(r.distributedCents); // i pari merito non perdono nulla
      }
    }
  });
});

describe("vettori d'oro payout (classi reali e sintetici)", () => {
  const dir = fileURLToPath(new URL("./golden/payout", import.meta.url));
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));

  it("almeno i vettori sintetici sono presenti", () => {
    expect(files.length).toBeGreaterThanOrEqual(3);
  });

  for (const file of files) {
    const v = JSON.parse(readFileSync(`${dir}/${file}`, "utf-8"));
    it(`${file}: ${v.description}`, () => {
      const purse = computePurse(v.purse);
      expect(purse.purseCents).toBe(v.expectedPurseCents);
      if (v.expectedComponents) expect(purse).toMatchObject(v.expectedComponents);

      const band = selectPaybackBand(paybackA, v.purse.confirmedEntries);
      const result = computePayout({
        purseCents: purse.purseCents,
        band,
        placements: v.placements as Placement<string>[],
      });
      expect(result.distributedCents).toBe(v.expected.distributedCents);
      expect(result.undistributedCents).toBe(v.expected.undistributedCents);
      expect(result.distributedCents + result.undistributedCents).toBe(
        purse.purseCents,
      );
      v.expected.placements.forEach(
        (
          exp: { rank: number; amountCents: number; perRefCents?: number[] },
          i: number,
        ) => {
          expect(result.placements[i]!.rank).toBe(exp.rank);
          expect(result.placements[i]!.amountCents).toBe(exp.amountCents);
          if (exp.perRefCents) {
            expect(result.placements[i]!.perRefCents).toEqual(exp.perRefCents);
          }
        },
      );
    });
  }
});
