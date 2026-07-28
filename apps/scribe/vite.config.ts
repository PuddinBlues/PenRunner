import { execSync } from "node:child_process";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// BR-81: PWA usabile da solo browser (offline incluso), nessuno store.
// Il service worker precache la shell → l'app apre con zero rete; "Aggiungi
// a Home" è comodità opzionale, mai imposta.
// BR-83: registerType "prompt" — nello scribe un reload a sorpresa in piena
// run è inaccettabile: banner + tap ("tra una run e l'altra"), il lavoro
// offline vive in IndexedDB e l'aggiornamento non lo tocca mai.

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
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      manifest: {
        name: "PenRunner Scribe",
        short_name: "Scribe",
        description: "Scoring giudice/scribe — reining, offline in arena",
        theme_color: "#0F172A",
        background_color: "#F8FAFC",
        display: "standalone",
        orientation: "portrait",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
      workbox: {
        // la shell è precachata; i dati vivono in IndexedDB, non nel SW
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
      },
    }),
  ],
});
