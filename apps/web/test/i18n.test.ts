import { describe, expect, it } from "vitest";
import { LOCALES, MESSAGES } from "../src/lib/i18n";

describe("cataloghi i18n (BR-60..62)", () => {
  it("entrambe le lingue sono complete: stesse chiavi, nessun buco", () => {
    const [a, b] = LOCALES;
    expect(Object.keys(MESSAGES[a!]).sort()).toEqual(
      Object.keys(MESSAGES[b!]).sort(),
    );
    for (const locale of LOCALES) {
      for (const [key, value] of Object.entries(MESSAGES[locale])) {
        expect(value, `${locale}:${key}`).toBeTruthy();
      }
    }
  });

  it("BR-61: il gergo di gara resta inglese in entrambe le lingue", () => {
    expect(MESSAGES.it["common.scoreInReview"]).toBe("Score in review");
    expect(MESSAGES.en["common.scoreInReview"]).toBe("Score in review");
    // "start list", "drag", "pattern" non si traducono
    expect(MESSAGES.it["startlist.title"]).toMatch(/Start list/);
    expect(MESSAGES.it["startlist.drag"]).toMatch(/Drag/);
    expect(MESSAGES.it["pattern.title"]).toMatch(/Pattern/);
  });
});
