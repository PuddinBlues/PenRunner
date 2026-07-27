import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { PaybackBand } from "@penrunner/core";

// Payback A dal file di dominio validato (ogni colonna somma 100%). Caricata
// una sola volta: è dato normativo, non cambia a runtime. Risoluzione da
// import.meta.url (root del repo/immagine, mai la cwd).
const PAYBACK_PATH = fileURLToPath(
  new URL("../../../../reference/payback-schedules.json", import.meta.url),
);

function loadPaybackFile(): { schedule_a: { table: PaybackBand[] } } {
  try {
    return JSON.parse(readFileSync(PAYBACK_PATH, "utf-8"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      // Fail-fast parlante: successo in staging quando l'immagine non
      // copiava reference/ — l'errore deve dire il rimedio, non solo il path.
      throw new Error(
        `reference/payback-schedules.json non trovato (${PAYBACK_PATH}): ` +
          "la cartella reference/ deve esistere accanto a packages/ e apps/ " +
          "— in un'immagine Docker va copiata (vedi apps/api/Dockerfile, COPY reference)",
      );
    }
    throw err;
  }
}

const file = loadPaybackFile();

export const PAYBACK_A: PaybackBand[] = file.schedule_a.table;
