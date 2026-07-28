// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { errorMessage } from "@penrunner/ui";

// ---------------------------------------------------------------------------
// Chokepoint degli errori (reperto staging: JSON Zod grezzo sotto il campo
// password). Il payload qui sotto è ESATTAMENTE ciò che tRPC serializza nel
// message quando l'input non passa lo schema.
// ---------------------------------------------------------------------------

const ZOD_TOO_SMALL = JSON.stringify([
  {
    code: "too_small",
    minimum: 10,
    type: "string",
    inclusive: true,
    exact: false,
    message: "String must contain at least 10 character(s)",
    path: ["password"],
  },
]);

const ZOD_EMAIL = JSON.stringify([
  {
    validation: "email",
    code: "invalid_string",
    message: "Invalid email",
    path: ["email"],
  },
]);

const ZOD_CUSTOM = JSON.stringify([
  {
    code: "custom",
    message: "Importo non valido: usare al massimo due decimali",
    path: ["addedMoney"],
  },
]);

beforeEach(() => {
  localStorage.clear();
});

describe("errorMessage (chokepoint form)", () => {
  it("traduce il too_small della password in italiano", () => {
    localStorage.setItem("penrunner_locale", "it");
    expect(errorMessage(new Error(ZOD_TOO_SMALL))).toBe(
      "Password: minimo 10 caratteri",
    );
  });

  it("traduce in inglese quando il locale è en", () => {
    localStorage.setItem("penrunner_locale", "en");
    expect(errorMessage(new Error(ZOD_TOO_SMALL))).toBe(
      "Password: at least 10 characters",
    );
  });

  it("email non valida → messaggio umano", () => {
    localStorage.setItem("penrunner_locale", "it");
    expect(errorMessage(new Error(ZOD_EMAIL))).toBe(
      "Indirizzo email non valido",
    );
  });

  it("i messaggi CUSTOM dei nostri schemi passano intatti", () => {
    localStorage.setItem("penrunner_locale", "it");
    expect(errorMessage(new Error(ZOD_CUSTOM))).toBe(
      "Importo non valido: usare al massimo due decimali",
    );
  });

  it("più issue → messaggi uniti e deduplicati", () => {
    localStorage.setItem("penrunner_locale", "it");
    const both = JSON.stringify([
      ...JSON.parse(ZOD_TOO_SMALL),
      ...JSON.parse(ZOD_EMAIL),
    ]);
    expect(errorMessage(new Error(both))).toBe(
      "Password: minimo 10 caratteri · Indirizzo email non valido",
    );
  });

  it("PONTE EN: i messaggi di dominio del server si traducono per l'app in inglese", () => {
    localStorage.setItem("penrunner_locale", "en");
    expect(errorMessage(new Error("Credenziali non valide"))).toBe(
      "Invalid credentials",
    );
    expect(
      errorMessage(new Error("«Whiz Dream» è già iscritto a «Open»")),
    ).toBe("\u201CWhiz Dream\u201D is already entered in \u201COpen\u201D");
    // fuori mappa → intatto (mai peggio di prima)
    expect(errorMessage(new Error("Qualcosa di mai visto"))).toBe(
      "Qualcosa di mai visto",
    );
    // in italiano non si tocca nulla
    localStorage.setItem("penrunner_locale", "it");
    expect(errorMessage(new Error("Credenziali non valide"))).toBe(
      "Credenziali non valide",
    );
  });

  it("FALLBACK: un messaggio non-Zod resta com'è (mai peggio di prima)", () => {
    // in italiano il ponte EN non tocca nulla (jsdom di default è en-US)
    localStorage.setItem("penrunner_locale", "it");
    expect(errorMessage(new Error("Credenziali non valide"))).toBe(
      "Credenziali non valide",
    );
    expect(errorMessage("stringa secca")).toBe("stringa secca");
    // JSON che non è un array di issue: intatto.
    expect(errorMessage(new Error('{"a":1}'))).toBe('{"a":1}');
  });
});
