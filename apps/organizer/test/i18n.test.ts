import { describe, expect, it } from "vitest";
import { LOCALES, MESSAGES, translator } from "../src/lib/i18n.js";

describe("i18n organizzatore (BR-60..62)", () => {
  it("entrambe le lingue complete: stesse chiavi", () => {
    expect(Object.keys(MESSAGES.it).sort()).toEqual(
      Object.keys(MESSAGES.en).sort(),
    );
    for (const l of LOCALES)
      for (const [k, v] of Object.entries(MESSAGES[l]))
        expect(v, `${l}:${k}`).toBeTruthy();
  });

  it("gergo di gara inglese in entrambe (BR-61)", () => {
    expect(MESSAGES.it["common.draw"]).toBe("Draw");
    expect(MESSAGES.en["common.draw"]).toBe("Draw");
    expect(MESSAGES.it["results.inReview"]).toBe("Score in review");
    expect(MESSAGES.en["results.inReview"]).toBe("Score in review");
  });

  it("interpolazione delle variabili", () => {
    const t = translator("it");
    expect(t("events.classes", { n: 4 })).toMatch(/4/);
    expect(t("draw.achievedGap", { gap: 6, target: 8 })).toMatch(/6.*8/);
  });

  it("copy BR-80: gli stati vuoti indicano il passo successivo", () => {
    // Non solo "nessun dato": dicono cosa fare o da dove arriverà.
    expect(MESSAGES.it["events.empty"]).toMatch(/wizard|Crea/i);
    expect(MESSAGES.it["classes.empty"]).toMatch(/catalogo/i);
    expect(MESSAGES.it["draw.empty"]).toMatch(/iscrizioni confermate/i);
    expect(MESSAGES.it["results.empty"]).toMatch(/draw|scribe/i);
  });
});
