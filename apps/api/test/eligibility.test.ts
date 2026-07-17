import { describe, expect, it } from "vitest";
import { evaluateEligibility } from "../src/eligibility.js";

// ---------------------------------------------------------------------------
// Il valutatore produce SOLO avvisi (BR-18): niente eccezioni, niente esiti
// bloccanti — un array, eventualmente vuoto.
// ---------------------------------------------------------------------------

const RIDER = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

type CategoryFacts = Parameters<typeof evaluateEligibility>[0];
type RiderFacts = Parameters<typeof evaluateEligibility>[1];

const baseCategory: CategoryFacts = {
  name: "Categoria test",
  fiseLicense: "1GR/2GR",
  membership: "Tessera socio IRHA",
  tecnicoFederaleRequired: false,
  horseOwnership: "non_di_proprieta",
  riderAge: null,
  earningsCap: null,
  horseEarningsCap: null,
};

const okRider: RiderFacts = {
  personId: RIDER,
  membershipIrha: "IRHA-123",
  membershipFise: "FISE-456",
  birthDate: "1990-05-01",
};

function run(
  category: Partial<typeof baseCategory>,
  rider: Partial<typeof okRider> = {},
  ownerId = RIDER,
  tecnicoName: string | null = null,
  eventYear = 2026,
) {
  return evaluateEligibility(
    { ...baseCategory, ...category },
    { ...okRider, ...rider },
    { ownerId },
    { tecnicoName },
    eventYear,
  );
}

describe("valutatore di eleggibilità (avvisi, mai blocchi — BR-18)", () => {
  it("binomio in regola → nessun avviso", () => {
    expect(run({})).toEqual([]);
  });

  it("BR-10: tessere o patenti mancanti a profilo", () => {
    const w = run({}, { membershipFise: null, membershipIrha: null });
    expect(w.map((x) => x.code)).toEqual(["BR-10", "BR-10"]);
    for (const x of w) expect(x.message).toMatch(/check-in/);
  });

  it("BR-15: età fuori limite, con la regola di permanenza citata", () => {
    const w = run(
      { riderAge: { max: 10, rule: "Chi compie 11 nell'anno resta" } },
      { birthDate: "2010-03-01" }, // 16 anni nel 2026
    );
    expect(w).toHaveLength(1);
    expect(w[0]!.code).toBe("BR-15");
    expect(w[0]!.message).toMatch(/possibile permanenza/);
    expect(w[0]!.message).toMatch(/Chi compie 11/);
  });

  it("BR-15: data di nascita mancante con limite d'età → avviso, non blocco", () => {
    const w = run({ riderAge: { min: 60 } }, { birthDate: null });
    expect(w[0]!.code).toBe("BR-15");
    expect(w[0]!.message).toMatch(/data di nascita/);
  });

  it("BR-15: età nel limite → nessun avviso", () => {
    expect(
      run({ riderAge: { min: 60 } }, { birthDate: "1960-01-15" }),
    ).toEqual([]);
  });

  it("BR-14 di_proprieta, owner ≠ rider: contempla il caso legittimo", () => {
    const w = run({ horseOwnership: "di_proprieta" }, {}, OTHER);
    expect(w).toHaveLength(1);
    expect(w[0]!.code).toBe("BR-14");
    // Non deve suonare come errore: famiglia stretta e lease sono ammessi.
    expect(w[0]!.message).toMatch(/famiglia stretta/);
    expect(w[0]!.message).toMatch(/lease/);
    expect(w[0]!.message).not.toMatch(/error|vietat/i);
  });

  it("BR-14 di_proprieta, owner = rider → nessun avviso", () => {
    expect(run({ horseOwnership: "di_proprieta" })).toEqual([]);
  });

  it("BR-14 condizionale pro/non-pro: enuncia la regola senza fingere di valutarla", () => {
    const w = run(
      { horseOwnership: "non_di_proprieta_per_pro_di_proprieta_per_np" },
      {},
      OTHER,
    );
    expect(w).toHaveLength(1);
    expect(w[0]!.message).toMatch(/qualifica del cavaliere/);
    expect(w[0]!.message).toMatch(/check-in/);
  });

  it("BR-13: tetto di vincite come avviso informativo", () => {
    const w = run({
      earningsCap: { amount: 350, currency: "EUR", scope: "carriera", ref: "IRHA" },
    });
    expect(w).toHaveLength(1);
    expect(w[0]!.code).toBe("BR-13");
    expect(w[0]!.message).toMatch(/350 EUR/);
    expect(w[0]!.message).toMatch(/dichiarato/);
  });

  it("BR-16: tecnico federale richiesto e non indicato", () => {
    const w = run({ tecnicoFederaleRequired: true });
    expect(w[0]!.code).toBe("BR-16");
    expect(run({ tecnicoFederaleRequired: true }, {}, RIDER, "M° Rossi")).toEqual([]);
  });

  it("caso peggiore: tanti avvisi insieme, comunque solo avvisi", () => {
    const w = run(
      {
        tecnicoFederaleRequired: true,
        horseOwnership: "di_proprieta",
        riderAge: { max: 10 },
        earningsCap: { amount: 500, currency: "EUR" },
      },
      { membershipFise: null, membershipIrha: null, birthDate: null },
      OTHER,
    );
    expect(w.length).toBeGreaterThanOrEqual(5);
    expect(new Set(w.map((x) => x.code))).toEqual(
      new Set(["BR-10", "BR-13", "BR-14", "BR-15", "BR-16"]),
    );
  });
});
