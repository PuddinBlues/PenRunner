import { execSync } from "node:child_process";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Back-office organizzatore: SPA da solo browser (BR-81: nessuno store,
// nessuna installazione). A differenza dello scribe non serve offline —
// niente service worker: l'aggiornamento è immediato come un sito (BR-83:
// resta senza SW finché non serve offline). Lo stamp di versione c'è
// comunque: "che versione hai?" vale per tutte le SPA.

/** SHA corto di build per lo stamp di versione (BR-83). */
function buildVersion(): string {
  if (process.env.WORKERS_CI_COMMIT_SHA) {
    return process.env.WORKERS_CI_COMMIT_SHA.slice(0, 7);
  }
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "dev";
  }
}

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(buildVersion()) },
  plugins: [react()],
});
