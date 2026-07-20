import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { PaybackBand } from "@penrunner/core";

// Payback A dal file di dominio validato (ogni colonna somma 100%). Caricata
// una sola volta: è dato normativo, non cambia a runtime.
const file = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL("../../../../reference/payback-schedules.json", import.meta.url),
    ),
    "utf-8",
  ),
) as { schedule_a: { table: PaybackBand[] } };

export const PAYBACK_A: PaybackBand[] = file.schedule_a.table;
