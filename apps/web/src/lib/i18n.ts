// ---------------------------------------------------------------------------
// i18n (BR-60..62): stringhe esternalizzate DAL PRIMO COMPONENTE, entrambe
// le lingue complete. Il gergo di gara resta in inglese in entrambe (BR-61):
// pattern, draw, scratch, score, run-off, added money… non si traducono.
// Percorsi pubblici per lingua: /it/… /en/… (BR-62).
// ---------------------------------------------------------------------------

export const LOCALES = ["it", "en"] as const;
export type Locale = (typeof LOCALES)[number];

const it = {
  "app.title": "PenRunner",
  "app.tagline": "Il reining, in diretta",
  "home.calendar": "Calendario gare",
  "home.noEvents": "Nessun evento a calendario",
  "event.live": "In diretta",
  "event.inField": "In campo",
  "event.previous": "Precedente",
  "event.nextUp": "A seguire",
  "event.leader": "Leader del go",
  "event.ranking": "Classifica",
  "event.rankingProvisional": "Classifica provvisoria",
  "event.rankingOfficial": "Classifica ufficiale",
  "event.officialAt": "Ufficiale alle",
  "event.goComplete": "Classe conclusa",
  "event.program": "Programma",
  "event.startList": "Start list",
  "event.status.bozza": "In preparazione",
  "event.status.annunciato": "Annunciato",
  "event.status.iscrizioni_aperte": "Iscrizioni aperte",
  "event.status.iscrizioni_chiuse": "Iscrizioni chiuse",
  "event.status.in_corso": "In corso",
  "event.status.concluso": "Concluso",
  "event.drawPending": "draw in arrivo",
  "event.nextClass": "Prossima classe in campo",
  "event.excluded": "Fuori classifica",
  "event.firstPlaceTie": "Pari merito al 1° posto: run-off o co-champion",
  "event.notStarted": "Il live inizia con la prima classe",
  "startlist.title": "Start list",
  "startlist.drag": "Drag — rinnovo fondo",
  "startlist.scratched": "Ritirato",
  "startlist.updatedAt": "Draw aggiornato il",
  "startlist.eta": "Turno stimato",
  "startlist.etaSchedule": "da programma",
  "startlist.runsBefore": "run prima",
  "pattern.title": "Pattern",
  "pattern.entry": "Ingresso",
  "pattern.trotInImposed":
    "Ingresso al trotto imposto dallo show management: la mancata osservanza comporta score 0",
  "pattern.steps": "Sequenza delle manovre",
  "pattern.gait.walk_in": "Walk-in (ingresso al passo)",
  "pattern.gait.trot_in": "Trot-in (ingresso al trotto)",
  "pattern.gait.lope_in": "Lope-in (ingresso al galoppo)",
  "scoreboard.portrait":
    "La scoreboard è pensata per gli schermi in arena. Segui l'evento dal tuo telefono:",
  "scoreboard.open": "Apri la pagina evento",
  "common.tier.regionale": "Regionale",
  "common.tier.nazionale": "Nazionale",
  "common.tier.internazionale": "Internazionale",
  "common.tier.premium": "Premium",
  "common.scoreInReview": "Score in review", // inglese in entrambe (BR-61)
  "common.minutes": "min",
} as const;

const en = {
  "app.title": "PenRunner",
  "app.tagline": "Reining, live",
  "home.calendar": "Show calendar",
  "home.noEvents": "No events scheduled",
  "event.live": "Live",
  "event.inField": "In the pen",
  "event.previous": "Previous",
  "event.nextUp": "Next up",
  "event.leader": "Go leader",
  "event.ranking": "Results",
  "event.rankingProvisional": "Provisional results",
  "event.rankingOfficial": "Official results",
  "event.officialAt": "Official at",
  "event.goComplete": "Class complete",
  "event.program": "Schedule",
  "event.startList": "Start list",
  "event.status.bozza": "In preparation",
  "event.status.annunciato": "Announced",
  "event.status.iscrizioni_aperte": "Entries open",
  "event.status.iscrizioni_chiuse": "Entries closed",
  "event.status.in_corso": "Running",
  "event.status.concluso": "Finished",
  "event.drawPending": "draw coming",
  "event.nextClass": "Next class in the pen",
  "event.excluded": "Not placed",
  "event.firstPlaceTie": "First place tie: run-off or co-champions",
  "event.notStarted": "Live coverage starts with the first class",
  "startlist.title": "Start list",
  "startlist.drag": "Drag",
  "startlist.scratched": "Scratched",
  "startlist.updatedAt": "Draw updated",
  "startlist.eta": "Estimated time",
  "startlist.etaSchedule": "scheduled",
  "startlist.runsBefore": "runs before",
  "pattern.title": "Pattern",
  "pattern.entry": "Entry",
  "pattern.trotInImposed":
    "Trot-in required by show management: failure to comply results in a score 0",
  "pattern.steps": "Maneuver sequence",
  "pattern.gait.walk_in": "Walk-in",
  "pattern.gait.trot_in": "Trot-in",
  "pattern.gait.lope_in": "Lope-in",
  "scoreboard.portrait":
    "The scoreboard is designed for arena screens. Follow the event on your phone:",
  "scoreboard.open": "Open the event page",
  "common.tier.regionale": "Regional",
  "common.tier.nazionale": "National",
  "common.tier.internazionale": "International",
  "common.tier.premium": "Premium",
  "common.scoreInReview": "Score in review",
  "common.minutes": "min",
} as const;

export type MessageKey = keyof typeof it;
export const MESSAGES: Record<Locale, Record<MessageKey, string>> = { it, en };

export function t(locale: Locale) {
  return (key: MessageKey) => MESSAGES[locale][key];
}

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}
