// i18n (BR-60..62): stringhe esternalizzate dal primo componente, it/en
// complete. Il gergo di gara resta inglese in entrambe (BR-61: draw, score,
// score in review, run…). Testi auto-esplicativi (BR-80).

export const LOCALES = ["it", "en"] as const;
export type Locale = (typeof LOCALES)[number];

const it = {
  "app.name": "PenRunner Scribe",
  "enter.welcome": "Benvenuto",
  "enter.linkInvalid": "Invito non valido o scaduto. Chiedi un nuovo link all'organizzazione.",
  "enter.loading": "Preparo la classe per l'uso offline…",
  "enter.ready": "Pronto. Da qui puoi lavorare anche senza rete.",
  "enter.installHint": "Suggerimento: aggiungi PenRunner alla schermata Home per lo schermo intero in arena (facoltativo).",
  "enter.pickClass": "Scegli la classe",
  "enter.pickJudge": "Per quale giudice segni?",
  "enter.you": "Tu (giudice)",
  "runlist.title": "Ordine di partenza",
  "runlist.empty": "Nessun binomio in questa classe.",
  "runlist.tapToScore": "Tocca un binomio per segnarlo",
  "run.waiting": "In attesa",
  "run.inField": "In campo",
  "run.closed": "Chiusa",
  "run.signed": "Firmata",
  "run.inReview": "Score in review",
  "score.sendToField": "Manda in campo",
  "score.maneuvers": "Manovre",
  "score.runPenalty": "Penalità di percorso",
  "score.score0": "Score 0",
  "score.noScore": "No score",
  "score.provisional": "Score provvisorio",
  "score.outOfPattern": "fuori pattern",
  "score.outOfRanking": "fuori classifica",
  "score.close": "Chiudi e annuncia",
  "score.missingManeuvers": "Mancano {n} manovre",
  "score.penaltyTitle": "Penalità · manovra {n}",
  "score.penaltyHint": "Inserisci il totale chiamato dal giudice",
  "score.hold": "Trattieni · score in review",
  "score.holdNote": "Nota del dubbio (es. back 4 o 5 passi → −2 o score 0)",
  "score.reopen": "Riapri per correggere",
  "confirm.closeTitle": "Chiudere la carta?",
  "confirm.closeBody": "Chiudi con totale {total}. Sarà annunciato come provvisorio e sincronizzato. Potrai riaprirlo fino alla firma.",
  "confirm.noScoreBody": "No score = fuori classifica. Confermi?",
  "confirm.score0Body": "Score 0 = punteggio 0, resta in classifica in fondo. Confermi?",
  "confirm.yes": "Conferma",
  "confirm.cancel": "Annulla",
  "sign.title": "Firma di fine classe",
  "sign.intro": "Il giudice rivede i totali e firma. Dopo la firma le carte sono definitive.",
  "sign.nothing": "Nessuna carta chiusa da firmare.",
  "sign.drawSignature": "Firma qui",
  "sign.clear": "Cancella",
  "sign.signAll": "Firma le {n} carte",
  "sign.signed": "Firmate {n} carte.",
  "offline.online": "Online",
  "offline.offline": "Offline",
  "offline.queued": "{n} in coda",
  "offline.allSynced": "Tutto sincronizzato",
  "offline.safe": "Al sicuro sul dispositivo",
  "recovery.title": "Ripresa dopo interruzione",
  "recovery.body": "{n} carte in coda, tutte al sicuro sul dispositivo. Riprendi da dove eri.",
  "recovery.otherDevice": "Attenzione: questa classe risulta già in scoring su un altro dispositivo. Puoi continuare (lo show non si ferma), ma evita di segnare in parallelo.",
  "common.close": "Chiudi",
  "common.back": "Indietro",
  "common.draw": "Draw",
} as const;

const en = {
  "app.name": "PenRunner Scribe",
  "enter.welcome": "Welcome",
  "enter.linkInvalid": "Invalid or expired invite. Ask the organization for a new link.",
  "enter.loading": "Preparing the class for offline use…",
  "enter.ready": "Ready. From here you can work without a network.",
  "enter.installHint": "Tip: add PenRunner to your Home screen for full-screen in the arena (optional).",
  "enter.pickClass": "Choose the class",
  "enter.pickJudge": "Which judge are you scoring for?",
  "enter.you": "You (judge)",
  "runlist.title": "Start list",
  "runlist.empty": "No entries in this class.",
  "runlist.tapToScore": "Tap an entry to score it",
  "run.waiting": "Waiting",
  "run.inField": "In the pen",
  "run.closed": "Closed",
  "run.signed": "Signed",
  "run.inReview": "Score in review",
  "score.sendToField": "Send to the pen",
  "score.maneuvers": "Maneuvers",
  "score.runPenalty": "Run penalty",
  "score.score0": "Score 0",
  "score.noScore": "No score",
  "score.provisional": "Provisional score",
  "score.outOfPattern": "off pattern",
  "score.outOfRanking": "not ranked",
  "score.close": "Close and announce",
  "score.missingManeuvers": "{n} maneuvers missing",
  "score.penaltyTitle": "Penalty · maneuver {n}",
  "score.penaltyHint": "Enter the total called by the judge",
  "score.hold": "Hold · score in review",
  "score.holdNote": "Doubt note (e.g. back 4 or 5 steps → −2 or score 0)",
  "score.reopen": "Reopen to correct",
  "confirm.closeTitle": "Close the card?",
  "confirm.closeBody": "Close with total {total}. It will be announced as provisional and synced. You can reopen it until signing.",
  "confirm.noScoreBody": "No score = not ranked. Confirm?",
  "confirm.score0Body": "Score 0 = zero score, ranked last. Confirm?",
  "confirm.yes": "Confirm",
  "confirm.cancel": "Cancel",
  "sign.title": "End-of-class signing",
  "sign.intro": "The judge reviews the totals and signs. After signing, cards are final.",
  "sign.nothing": "No closed cards to sign.",
  "sign.drawSignature": "Sign here",
  "sign.clear": "Clear",
  "sign.signAll": "Sign the {n} cards",
  "sign.signed": "Signed {n} cards.",
  "offline.online": "Online",
  "offline.offline": "Offline",
  "offline.queued": "{n} queued",
  "offline.allSynced": "All synced",
  "offline.safe": "Safe on this device",
  "recovery.title": "Recovery after interruption",
  "recovery.body": "{n} cards queued, all safe on this device. Pick up where you left off.",
  "recovery.otherDevice": "Heads up: this class appears to be scored on another device already. You can continue (the show goes on), but avoid scoring in parallel.",
  "common.close": "Close",
  "common.back": "Back",
  "common.draw": "Draw",
} as const;

export type MessageKey = keyof typeof it;
export const MESSAGES: Record<Locale, Record<MessageKey, string>> = { it, en };

export function detectLocale(): Locale {
  const stored = localStorage.getItem("penrunner_locale");
  if (stored === "it" || stored === "en") return stored;
  return navigator.language?.toLowerCase().startsWith("it") ? "it" : "en";
}

export function translator(locale: Locale) {
  return (key: MessageKey, vars?: Record<string, string | number>) => {
    let s: string = MESSAGES[locale][key];
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
    return s;
  };
}
