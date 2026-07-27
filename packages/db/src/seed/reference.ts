import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  championship,
  entryGait,
  horseOwnership,
  maneuverType,
} from "../schema/enums.js";

// ---------------------------------------------------------------------------
// Caricamento e validazione dei dati normativi digitalizzati in reference/.
// I dati si usano così come sono: qui si verifica che il file sia integro,
// non si corregge né si integra nulla (i valori normativi non si inventano).
// ---------------------------------------------------------------------------

const REFERENCE_DIR = new URL("../../../../reference/", import.meta.url);

export interface ReferenceManeuver {
  order: number;
  types: string[];
  it: string;
}

export interface ReferencePattern {
  code: string;
  name: string;
  entry: {
    gait: string;
    trot_in_mandatable?: boolean;
    start?: string;
    note?: string;
  };
  restricted_to?: string[];
  maneuvers: ReferenceManeuver[];
}

export interface ReferencePatternsFile {
  source: string;
  season: number;
  patterns: ReferencePattern[];
}

export interface ReferenceCategory {
  code: string;
  name: string;
  championship: string;
  fise_license?: string;
  membership?: string;
  tecnico_federale_required?: boolean;
  tecnico_note?: string;
  horse_ownership: string;
  horse_notes?: string;
  rider_age?: unknown;
  earnings_cap?: unknown;
  horse_earnings_cap?: unknown;
  nrha_final?: boolean;
  restricted?: string;
  notes?: string;
}

export interface ReferenceCategoriesFile {
  source: string;
  season: number;
  categories: ReferenceCategory[];
  ownership_vocabulary: Record<string, string>;
}

function readJson(name: string): unknown {
  const path = fileURLToPath(new URL(name, REFERENCE_DIR));
  return JSON.parse(readFileSync(path, "utf-8"));
}

function fail(file: string, message: string): never {
  throw new Error(`Seed non valido (${file}): ${message}`);
}

export function loadPatterns(): ReferencePatternsFile {
  const data = readJson("patterns.json") as ReferencePatternsFile;
  const file = "reference/patterns.json";

  if (!Number.isInteger(data.season)) fail(file, "season mancante");
  if (data.patterns.length !== 20)
    fail(file, `attesi 20 pattern, trovati ${data.patterns.length}`);

  const codes = new Set(data.patterns.map((p) => p.code));
  if (codes.size !== data.patterns.length) fail(file, "codici pattern duplicati");

  const validGaits = new Set<string>(entryGait.enumValues);
  const validTypes = new Set<string>(maneuverType.enumValues);

  for (const p of data.patterns) {
    if (!validGaits.has(p.entry.gait))
      fail(file, `pattern ${p.code}: gait sconosciuta "${p.entry.gait}"`);
    if (p.restricted_to && !["A", "B"].includes(p.code))
      fail(file, `pattern ${p.code}: restricted_to atteso solo su A e B`);
    if (["A", "B"].includes(p.code) && !p.restricted_to?.length)
      fail(file, `pattern ${p.code}: restricted_to mancante`);
    if (p.maneuvers.length === 0) fail(file, `pattern ${p.code}: nessuna manovra`);
    p.maneuvers.forEach((m, i) => {
      if (m.order !== i + 1)
        fail(file, `pattern ${p.code}: ordini non contigui (atteso ${i + 1}, trovato ${m.order})`);
      if (!m.types.length || !m.it)
        fail(file, `pattern ${p.code} passo ${m.order}: types o testo mancanti`);
      for (const t of m.types) {
        if (!validTypes.has(t))
          fail(file, `pattern ${p.code} passo ${m.order}: tipo manovra sconosciuto "${t}"`);
      }
    });
  }
  return data;
}

export function loadCategories(): ReferenceCategoriesFile {
  const data = readJson("categories.json") as ReferenceCategoriesFile;
  const file = "reference/categories.json";

  if (!Number.isInteger(data.season)) fail(file, "season mancante");
  if (data.categories.length !== 24)
    fail(file, `attese 24 categorie, trovate ${data.categories.length}`);

  const codes = new Set(data.categories.map((c) => c.code));
  if (codes.size !== data.categories.length) fail(file, "codici categoria duplicati");

  const validChampionships = new Set<string>(championship.enumValues);
  const validOwnership = new Set<string>(horseOwnership.enumValues);

  for (const c of data.categories) {
    if (!validChampionships.has(c.championship))
      fail(file, `categoria ${c.code}: campionato sconosciuto "${c.championship}"`);
    if (!validOwnership.has(c.horse_ownership))
      fail(file, `categoria ${c.code}: horse_ownership sconosciuto "${c.horse_ownership}"`);
    if (!(c.horse_ownership in data.ownership_vocabulary))
      fail(file, `categoria ${c.code}: horse_ownership fuori dal vocabolario del file`);
  }
  return data;
}
