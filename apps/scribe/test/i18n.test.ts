import { describe, expect, it } from "vitest";
import { LOCALES, MESSAGES, translator } from "../src/lib/i18n.js";

describe("i18n scribe (BR-60..62)", () => {
  it("entrambe le lingue complete: stesse chiavi", () => {
    expect(Object.keys(MESSAGES.it).sort()).toEqual(Object.keys(MESSAGES.en).sort());
    for (const l of LOCALES)
      for (const [k, v] of Object.entries(MESSAGES[l]))
        expect(v, `${l}:${k}`).toBeTruthy();
  });

  it("gergo di gara inglese in entrambe (BR-61)", () => {
    expect(MESSAGES.it["run.inReview"]).toBe("Score in review");
    expect(MESSAGES.en["run.inReview"]).toBe("Score in review");
    expect(MESSAGES.it["common.draw"]).toBe("Draw");
  });

  it("interpolazione delle variabili", () => {
    const t = translator("it");
    expect(t("score.missingManeuvers", { n: 3 })).toMatch(/3/);
    expect(t("confirm.closeBody", { total: "70.5" })).toMatch(/70\.5/);
  });
});
