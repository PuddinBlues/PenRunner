import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Guardia BR-83 (norma della guardia): il bundle stantio del service worker
// era una CLASSE di bug (tre sintomi diversi, una causa). Questi pin rendono
// impossibile tornare ad "autoUpdate silenzioso senza banner" senza rompere
// un test.
// ---------------------------------------------------------------------------

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("contratto PWA (BR-83)", () => {
  it("il service worker è in modalità prompt: mai aggiornamenti silenziosi", () => {
    const config = read("vite.config.ts");
    expect(config).toMatch(/registerType:\s*"prompt"/);
    expect(config).not.toMatch(/registerType:\s*"autoUpdate"/);
  });

  it("l'hook di aggiornamento è registrato e cablato ai check", () => {
    const prompt = read("src/components/UpdatePrompt.tsx");
    expect(prompt).toContain("useRegisterSW");
    expect(prompt).toContain("useUpdateChecks");
    // Il banner vive nella shell: presente su ogni schermata.
    expect(read("src/App.tsx")).toContain("<UpdatePrompt");
  });

  it("lo stamp di versione è definito e montato", () => {
    expect(read("vite.config.ts")).toContain("__APP_VERSION__");
    expect(read("src/App.tsx")).toContain("VersionStamp");
  });
});
