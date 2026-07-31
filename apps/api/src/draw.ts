import { randomInt } from "node:crypto";

// ---------------------------------------------------------------------------
// Generazione del draw (flusso E, BR-19/BR-91). Funzione pura con RNG
// iniettabile.
//
// Distanziamento: tra due partenze dello stesso cavaliere nella stessa classe
// l'obiettivo è avere ALMENO `minRiderGap` cavalli in mezzo — parametro
// dell'evento (BR-91: default 10, minimo ammesso 8 — il tempo di scaldare il
// cavallo successivo). gap(a, b) = |pos_a − pos_b| − 1 (cavalli in mezzo).
//
// La generazione NON fallisce mai (spirito BR-18): si degrada a scala
// (target→…→1) e, se perfino il "mai back-to-back" è impossibile, restituisce
// il best-effort che massimizza il gap minimo, con warnings sulle coppie
// sotto l'obiettivo richiesto. Il sistema segnala, l'organizzatore decide.
// ---------------------------------------------------------------------------

export interface DrawCandidate {
  entryId: string;
  riderId: string;
}

export interface DrawWarning {
  riderId: string;
  /** posizioni 1-based delle due partenze troppo vicine */
  positions: [number, number];
  /** cavalli in mezzo ottenuti */
  gap: number;
  /** cavalli in mezzo richiesti */
  targetGap: number;
}

export interface DrawResult {
  /** entryId in ordine di partenza (posizione = indice + 1) */
  order: string[];
  targetGap: number;
  /** gap minimo tra partenze dello stesso cavaliere (null: nessun doppio) */
  achievedGap: number | null;
  warnings: DrawWarning[];
}

export type Rng = (maxExclusive: number) => number;

const defaultRng: Rng = (max) => randomInt(max);

function shuffle<T>(items: T[], rng: Rng): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng(i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Gap minimo (cavalli in mezzo) tra partenze dello stesso cavaliere. */
function minGapOf(order: DrawCandidate[]): number | null {
  let min: number | null = null;
  const lastSeen = new Map<string, number>();
  order.forEach((c, i) => {
    const prev = lastSeen.get(c.riderId);
    if (prev !== undefined) {
      const gap = i - prev - 1;
      if (min === null || gap < min) min = gap;
    }
    lastSeen.set(c.riderId, i);
  });
  return min;
}

function violatesAt(order: DrawCandidate[], index: number, gap: number): boolean {
  const c = order[index]!;
  const from = Math.max(0, index - gap - 1);
  for (let i = from; i < index; i++) {
    if (i !== index && order[i]!.riderId === c.riderId) return true;
  }
  for (let i = index + 1; i <= Math.min(order.length - 1, index + gap + 1); i++) {
    if (order[i]!.riderId === c.riderId) return true;
  }
  return false;
}

/** Riparazione greedy: scambia le posizioni in violazione con posizioni compatibili. */
function tryRepair(
  shuffled: DrawCandidate[],
  gap: number,
): DrawCandidate[] | null {
  const order = [...shuffled];
  for (let pass = 0; pass < order.length; pass++) {
    let violations = 0;
    for (let i = 0; i < order.length; i++) {
      if (!violatesAt(order, i, gap)) continue;
      violations++;
      let repaired = false;
      for (let j = 0; j < order.length && !repaired; j++) {
        if (j === i) continue;
        [order[i], order[j]] = [order[j]!, order[i]!];
        if (!violatesAt(order, i, gap) && !violatesAt(order, j, gap)) {
          repaired = true;
        } else {
          [order[i], order[j]] = [order[j]!, order[i]!];
        }
      }
    }
    if (violations === 0) return order;
  }
  const check = minGapOf(order);
  return check === null || check >= gap ? order : null;
}

export function generateDraw(
  candidates: DrawCandidate[],
  opts: { minRiderGap?: number; rng?: Rng; attemptsPerGap?: number } = {},
): DrawResult {
  const targetGap = opts.minRiderGap ?? 10; // BR-91 (era 8, BR-19)
  const rng = opts.rng ?? defaultRng;
  const attempts = opts.attemptsPerGap ?? 30;

  if (candidates.length === 0) {
    return { order: [], targetGap, achievedGap: null, warnings: [] };
  }

  let best: DrawCandidate[] = shuffle(candidates, rng);
  let bestGap = minGapOf(best);

  // Scala di degradazione: target → … → 1.
  for (let gap = Math.min(targetGap, candidates.length - 1); gap >= 1; gap--) {
    for (let attempt = 0; attempt < attempts; attempt++) {
      const repaired = tryRepair(shuffle(candidates, rng), gap);
      if (!repaired) continue;
      const achieved = minGapOf(repaired);
      if (bestGap === null || achieved === null || achieved > bestGap) {
        best = repaired;
        bestGap = achieved;
      }
      if (achieved === null || achieved >= gap) {
        // Soddisfatto a questo livello: non serve degradare oltre.
        return buildResult(best, targetGap);
      }
    }
  }
  // Nemmeno gap 1 soddisfacibile (es. un cavaliere con più di ⌈n/2⌉ binomi):
  // best-effort col gap minimo massimizzato tra i tentativi.
  return buildResult(best, targetGap);
}

/**
 * BR-91: le coppie sotto l'obiettivo, PUNTUALI (chi, dove, quanto) — usate
 * dal generatore, dal riordino manuale (flag live) e dal suggerimento.
 */
export function computeGapWarnings(
  order: DrawCandidate[],
  targetGap: number,
): DrawWarning[] {
  const warnings: DrawWarning[] = [];
  const lastSeen = new Map<string, number>();
  order.forEach((c, i) => {
    const prev = lastSeen.get(c.riderId);
    if (prev !== undefined) {
      const gap = i - prev - 1;
      if (gap < targetGap) {
        warnings.push({
          riderId: c.riderId,
          positions: [prev + 1, i + 1],
          gap,
          targetGap,
        });
      }
    }
    lastSeen.set(c.riderId, i);
  });
  return warnings;
}

function buildResult(order: DrawCandidate[], targetGap: number): DrawResult {
  return {
    order: order.map((c) => c.entryId),
    targetGap,
    achievedGap: minGapOf(order),
    warnings: computeGapWarnings(order, targetGap),
  };
}

export interface SuggestResult extends DrawResult {
  /** entryId spostati rispetto all'ordine di partenza del suggerimento */
  moved: string[];
}

/**
 * BR-91 "sistema l'ordine": riparazione ANCORATA all'ordine corrente —
 * niente shuffle, si spostano solo i binomi in violazione verso lo slot
 * legale più vicino (minime modifiche). Deterministica: stessa lista, stessa
 * proposta. Se il vincolo è impossibile, degrada a scala e restituisce il
 * best-effort coi warnings — mai un errore.
 */
export function suggestRepair(
  current: DrawCandidate[],
  targetGap: number,
): SuggestResult {
  const posOf = new Map(current.map((c, i) => [c.entryId, i]));
  const movedOf = (order: DrawCandidate[]) =>
    order
      .filter((c, i) => posOf.get(c.entryId) !== i)
      .map((c) => c.entryId);

  for (let gap = Math.min(targetGap, current.length - 1); gap >= 1; gap--) {
    const repaired = tryRepair([...current], gap);
    if (!repaired) continue;
    const achieved = minGapOf(repaired);
    if (achieved === null || achieved >= gap) {
      return { ...buildResult(repaired, targetGap), moved: movedOf(repaired) };
    }
  }
  // nemmeno "mai back-to-back" è possibile: l'ordine resta quello, coi flag
  return { ...buildResult(current, targetGap), moved: [] };
}

// ---------------------------------------------------------------------------
// Marker di drag (BR-51, validata col giudice): POSIZIONI FISSE del draw
// pubblicato — "se c'è uno scratch ne entrano 4 invece di 5, il trattore
// resta lì". Il confine non si sposta MAI (evita contestazioni sull'arena
// pulita): lo scratch accorcia il blocco, il marker rimane sulla sua
// posizione. L'intervallo è un'impostazione di gara (drag_every_n, default
// 5; nei regionali affollati anche 7 o 10).
// ---------------------------------------------------------------------------

export interface StartListRow {
  drawNumber: number;
  /** false per ritirata/assente — irrilevante per i marker (fissi), usato
   *  dai chiamanti per "prima partenza effettiva dopo il drag" (BR-43). */
  effective: boolean;
}

/**
 * Ritorna i drawNumber DOPO i quali cade un drag: ogni `dragEveryNRuns`
 * POSIZIONI del draw pubblicato, scratch inclusi, se dopo ne restano altre.
 */
export function computeDragMarkers(
  rows: StartListRow[],
  dragEveryNRuns: number,
): number[] {
  const markers: number[] = [];
  const ordered = [...rows].sort((a, b) => a.drawNumber - b.drawNumber);
  for (let i = dragEveryNRuns; i < ordered.length; i += dragEveryNRuns) {
    markers.push(ordered[i - 1]!.drawNumber);
  }
  return markers;
}
