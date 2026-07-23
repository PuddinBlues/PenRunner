import { describe, expect, it } from "vitest";
import { LOCALES, MESSAGES, translator } from "../src/lib/i18n.js";

describe("i18n scuderia (BR-60..62)", () => {
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
    expect(MESSAGES.it["mine.scratch"]).toBe("Scratch");
    expect(MESSAGES.en["mine.scratch"]).toBe("Scratch");
  });

  it("copy BR-80: gli stati vuoti indicano il passo successivo", () => {
    expect(MESSAGES.it["roster.horsesEmpty"]).toMatch(/aggiungi/i);
    expect(MESSAGES.it["mine.empty"]).toMatch(/Iscrivi/);
    expect(MESSAGES.it["enroll.noEvents"]).toMatch(/organizzatore/i);
    expect(MESSAGES.it["enroll.needRoster"]).toMatch(/roster/i);
  });

  it("la conferma di scratch elenca le TRE conseguenze (BR-17)", () => {
    for (const l of LOCALES) {
      const body = MESSAGES[l]["mine.scratchBody"];
      expect(body).toMatch(/draw/i); // buco nel draw
      expect(body).toMatch(/classifica|ranking/i); // fuori classifica/premi
      expect(body).toMatch(/quota|fee/i); // fee dovuta
    }
  });

  it("interpolazione", () => {
    const t = translator("it");
    expect(t("enroll.fee", { n: 2 })).toMatch(/2 cavalli distinti/);
  });
});
