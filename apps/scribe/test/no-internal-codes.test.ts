import { execSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// GUARDIA (definition of done, fase a del programma qualità): i codici
// interni non attraversano MAI il confine verso l'utente. Si builda la
// PRODUZIONE vera e si scandisce ogni asset: una stringa BR-<n> nel bundle
// rompe questo test, non un utente in gara.
// ---------------------------------------------------------------------------

const root = join(__dirname, "..");

function scan(dir: string, out: string[]) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) {
      scan(p, out);
    } else if (/\.(js|css|html)$/.test(f)) {
      const hits = readFileSync(p, "utf8").match(/BR-\d+/g);
      if (hits) out.push(`${f}: ${[...new Set(hits)].join(", ")}`);
    }
  }
}

describe("guardia bundle: nessun codice interno a video", () => {
  it(
    "la build di produzione non contiene stringhe BR-<n>",
    () => {
      execSync("npx vite build", { cwd: root, stdio: "pipe" });
      const offenders: string[] = [];
      scan(join(root, "dist"), offenders);
      expect(offenders).toEqual([]);
    },
    180_000,
  );
});
