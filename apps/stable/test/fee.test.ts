import { describe, expect, it } from "vitest";
import { computeFeeBreakdown } from "../src/lib/fee.js";

// La stima live deve coincidere col server (che fa fede): il caso del
// prototipo — 215 € — è lo stesso vettore del test API dello step 3.

describe("fee live (BR-01: per cavallo distinto)", () => {
  it("il caso del prototipo: 2 cavalli, 3 iscrizioni → 215 €", () => {
    const items = [
      { horseId: "A", classId: "open" },
      { horseId: "A", classId: "green" },
      { horseId: "B", classId: "open" },
    ];
    const breakdown = computeFeeBreakdown(items, { open: 75, green: 35 }, 15);
    expect(breakdown).toEqual({
      enrollments: 3,
      classesCost: 185, // 75 + 35 + 75
      horses: 2, // distinti, non 3
      fee: 30, // 2 × 15
      total: 215,
    });
  });

  it("stesso cavallo in N classi → una sola fee", () => {
    const items = [
      { horseId: "A", classId: "c1" },
      { horseId: "A", classId: "c2" },
      { horseId: "A", classId: "c3" },
    ];
    const b = computeFeeBreakdown(items, { c1: 10, c2: 10, c3: 10 }, 15);
    expect(b.horses).toBe(1);
    expect(b.fee).toBe(15);
    expect(b.total).toBe(45);
  });

  it("griglia vuota → tutto zero", () => {
    const b = computeFeeBreakdown([], {}, 15);
    expect(b.total).toBe(0);
    expect(b.horses).toBe(0);
  });
});
