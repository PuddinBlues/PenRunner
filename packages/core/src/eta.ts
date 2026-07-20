// ---------------------------------------------------------------------------
// Turno stimato (BR-50..52): vista DERIVATA, mai memorizzata.
// ETA = àncora + Σ slot delle run effettive rimanenti + drag nell'intervallo.
// - àncora = ultimo started_at osservato ("manda in campo", registrato dallo
//   scribe); senza àncora → modalità "da programma": nessun orario promesso,
//   solo il conteggio delle run mancanti (display onesto, sempre "~");
// - la cadenza osservata (media mobile degli ultimi started_at) sostituisce
//   progressivamente lo slot di default (BR-52);
// - i drag si contano sulle run effettive, scratch esclusi (BR-51).
// Pause di programma: Fase 2 (nessuna entità schedule in MVP).
// ---------------------------------------------------------------------------

export interface EtaRow<Ref> {
  ref: Ref;
  drawNumber: number;
  /** false per ritirata/assente (buco nel draw) */
  effective: boolean;
  /** true se la run è già stata corsa o è in campo */
  done: boolean;
}

export interface EtaParams {
  slotSeconds: number; // default evento (270)
  dragEveryNRuns: number; // default 5
  dragSeconds: number; // default 420
  /** started_at osservati (epoch ms, ordine cronologico) per la cadenza */
  observedStartsMs: number[];
  /** quante osservazioni recenti pesare nella media mobile */
  cadenceWindow?: number;
}

export interface EtaEstimate<Ref> {
  ref: Ref;
  /** run effettive prima di questa (dalla prossima in poi) */
  runsBefore: number;
  /** secondi stimati dall'àncora; null in modalità "da programma" senza àncora */
  etaMs: number | null;
  /** epoch ms stimato; null senza àncora */
  etaAtMs: number | null;
  mode: "live" | "schedule";
}

/** Cadenza osservata: media mobile degli intervalli tra gli ultimi start. */
export function observedCadenceSeconds(
  observedStartsMs: number[],
  window = 5,
): number | null {
  const recent = observedStartsMs.slice(-Math.max(2, window));
  if (recent.length < 2) return null;
  const intervals = recent.slice(1).map((t, i) => (t - recent[i]!) / 1000);
  const usable = intervals.filter((s) => s > 30 && s < 3600);
  if (usable.length === 0) return null;
  return usable.reduce((a, b) => a + b, 0) / usable.length;
}

export function computeEta<Ref>(
  rows: EtaRow<Ref>[],
  anchorMs: number | null,
  params: EtaParams,
): EtaEstimate<Ref>[] {
  const cadence = observedCadenceSeconds(
    params.observedStartsMs,
    params.cadenceWindow,
  );
  const slotS = cadence ?? params.slotSeconds;
  const ordered = [...rows].sort((a, b) => a.drawNumber - b.drawNumber);
  // posizione effettiva progressiva dall'inizio classe (per i confini drag)
  let effectiveIndex = 0;
  const effectivePositions = new Map<number, number>(); // drawNumber → indice effettivo 1-based
  for (const r of ordered) {
    if (r.effective) {
      effectiveIndex += 1;
      effectivePositions.set(r.drawNumber, effectiveIndex);
    }
  }
  const doneEffective = ordered.filter((r) => r.effective && r.done).length;

  const out: EtaEstimate<Ref>[] = [];
  for (const r of ordered) {
    if (r.done || !r.effective) continue;
    const myPos = effectivePositions.get(r.drawNumber)!;
    const runsBefore = myPos - doneEffective - 1;
    // drag i cui confini cadono tra l'ultima run partita e la mia
    const drags =
      Math.floor((myPos - 1) / params.dragEveryNRuns) -
      Math.floor(doneEffective / params.dragEveryNRuns);
    const etaMs =
      anchorMs === null
        ? null
        : Math.round((runsBefore + 1) * slotS + drags * params.dragSeconds) *
          1000;
    out.push({
      ref: r.ref,
      runsBefore,
      etaMs,
      etaAtMs: anchorMs === null || etaMs === null ? null : anchorMs + etaMs,
      mode: anchorMs === null ? "schedule" : "live",
    });
  }
  return out;
}
