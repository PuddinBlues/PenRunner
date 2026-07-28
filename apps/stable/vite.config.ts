import { execSync } from "node:child_process";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// App scuderia: la più mobile di tutte — si usa dal telefono, a bordo campo.
// PWA da solo browser (BR-81): shell precachata e "Aggiungi a Home"
// facoltativo. NIENTE layer dati offline (dichiarato): l'iscrizione richiede
// rete; l'offline-first resta un requisito del solo scoring.
// BR-83: registerType "prompt" — l'aggiornamento è un banner + tap, mai un
// reload a sorpresa; i check girano al focus e a intervallo (UpdatePrompt).

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
        name: "PenRunner Scuderia",
        short_name: "Scuderia",
        description: "Roster e iscrizioni — reining, dal telefono",
        theme_color: "#F8FAFC",
        background_color: "#F8FAFC",
        display: "standalone",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
      },
    }),
  ],
});
