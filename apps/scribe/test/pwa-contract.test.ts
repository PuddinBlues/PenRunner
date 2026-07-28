import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Guardia BR-83 con la cautela offline-first (BR-81): nello scribe un reload
// a sorpresa in piena run è inaccettabile e il lavoro non sincronizzato non
// si tocca. Questi pin impediscono di tornare ad autoUpdate o di perdere la
// nota sulla coda senza rompere un test.
// ---------------------------------------------------------------------------

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("contratto PWA scribe (BR-83 + BR-81)", () => {
  it("il service worker è in modalità prompt: mai reload a sorpresa in arena", () => {
    const config = read("vite.config.ts");
    expect(config).toMatch(/registerType:\s*"prompt"/);
    expect(config).not.toMatch(/registerType:\s*"autoUpdate"/);
  });

  it("l'hook è registrato, cablato ai check e informato sulla coda di sync", () => {
    const prompt = read("src/components/UpdatePrompt.tsx");
    expect(prompt).toContain("useRegisterSW");
    expect(prompt).toContain("useUpdateChecks");
    expect(prompt).toContain("update.pendingNote");
    // La shell passa la coda reale, non un valore finto.
    expect(read("src/App.tsx")).toMatch(
      /<UpdatePrompt[\s\S]*?pending=\{queue\.cards \+ queue\.events\}/,
    );
  });

  it("lo stamp di versione è definito e montato", () => {
    expect(read("vite.config.ts")).toContain("__APP_VERSION__");
    expect(read("src/App.tsx")).toContain("VersionStamp");
  });
});
