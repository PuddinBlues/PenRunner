// ---------------------------------------------------------------------------
// BR-90: cut-off delle modifiche self-serve — "iscrizioni e ripensamenti fino
// alle HH:MM del giorno prima" (regola dell'evento, default 18:00, mai
// hardcoded). Dal cut-off della vigilia fino alla fine dell'evento il
// self-serve delle NUOVE iscrizioni è chiuso: si passa dalla segreteria
// (l'organizzatore può sempre, via "inserisci a distanza"). Lo scratch
// self-serve NON c'entra: resta BR-17, fino al proprio turno.
//
// Nota di modello (dichiarata nel piano B1): senza l'assegnazione
// classi→giornate il cut-off si applica alla VIGILIA DELL'EVENTO; il
// raffinamento per-giornata arriva col draw multi-giornata (OrganizerRegia
// v4). Orari in Europe/Rome: le gare sono lì, il server no.
// ---------------------------------------------------------------------------

const ROME_FMT = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Rome",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** Data e ora correnti in Europe/Rome, confrontabili lessicograficamente. */
function romeParts(now: Date): { date: string; time: string } {
  // sv-SE produce "YYYY-MM-DD HH:MM"
  const [date, time] = ROME_FMT.format(now).split(" ");
  return { date: date!, time: time! };
}

function dayBefore(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export interface CutoffEvent {
  startDate: string;
  endDate: string;
  /** "HH:MM" (BR-90, default a schema 18:00) */
  entryChangeCutoff: string;
}

/**
 * true se il self-serve delle nuove iscrizioni è CHIUSO: dal cut-off della
 * vigilia (Europe/Rome) fino alla fine dell'evento incluso.
 */
export function selfServeEntriesClosed(event: CutoffEvent, now = new Date()): boolean {
  const { date, time } = romeParts(now);
  const eve = dayBefore(event.startDate);
  if (date > event.endDate) return false; // evento finito: irrilevante
  if (date < eve) return false; // ampiamente prima della vigilia
  if (date === eve) return time >= event.entryChangeCutoff;
  return true; // dalla mezzanotte dopo la vigilia in poi
}
