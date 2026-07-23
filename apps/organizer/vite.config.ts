import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Back-office organizzatore: SPA da solo browser (BR-81: nessuno store,
// nessuna installazione). A differenza dello scribe non serve offline —
// niente service worker: l'aggiornamento è immediato come un sito.
export default defineConfig({
  plugins: [react()],
});
