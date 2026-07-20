import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// BR-81: PWA usabile da solo browser (offline incluso), nessuno store.
// Il service worker precache la shell → l'app apre con zero rete; "Aggiungi
// a Home" è comodità opzionale, mai imposta.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate", // aggiornamenti immediati come un sito
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
