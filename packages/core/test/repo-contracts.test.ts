import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// GUARDIA norma anti-perdite: i prototipi sono VINCOLANTI, quindi ogni file
// citato nella sezione "Le schermate" del CLAUDE.md deve esistere in
// prototypes/. Un riferimento vincolante che punta a un file fantasma deve
// rompere in CI, non scoprirsi in Fase 3 durante il side-by-side.
// ---------------------------------------------------------------------------

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));

describe("contratto prototipi (norma anti-perdite)", () => {
  it("ogni prototipo citato nel CLAUDE.md esiste su disco", () => {
    const md = readFileSync(`${ROOT}CLAUDE.md`, "utf8");
    const cited = [...new Set(md.match(/`([A-Za-z]+\.(?:jsx|tsx))`/g) ?? [])]
      .map((s) => s.replaceAll("`", ""));
    expect(cited.length).toBeGreaterThanOrEqual(9);
    for (const file of cited) {
      expect(
        existsSync(`${ROOT}prototypes/${file}`),
        `CLAUDE.md cita ${file} ma prototypes/${file} non esiste`,
      ).toBe(true);
    }
  });

  it("le sedi degli artefatti ratificati esistono (pitch/, docs/design/)", () => {
    for (const p of [
      "pitch/PenRunner_Pitch_IRHA.html",
      "docs/design/REGOLE-DESIGN.md",
      "docs/design/MAPPA-UX.md",
    ]) {
      expect(existsSync(ROOT + p), `${p} mancante`).toBe(true);
    }
  });
});
