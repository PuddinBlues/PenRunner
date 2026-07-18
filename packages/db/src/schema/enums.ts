import { pgEnum } from "drizzle-orm/pg-core";

// I valori degli stati riprendono alla lettera le macchine a stati della
// spec funzionale, così le regole BR restano citabili senza tradurre.
// Il gergo di gara (walk_in, scratch, lead_change…) resta in inglese (BR-61).

export const personCategory = pgEnum("person_category", [
  "open",
  "non_pro",
  "youth",
  "rookie",
]);

// BR-62: lingua per email e notifiche, salvata sul profilo.
export const locale = pgEnum("locale", ["it", "en"]);

export const eventTier = pgEnum("event_tier", [
  "regionale",
  "nazionale",
  "internazionale",
  "premium",
]);

export const eventStatus = pgEnum("event_status", [
  "bozza",
  "annunciato",
  "iscrizioni_aperte",
  "iscrizioni_chiuse",
  "in_corso",
  "concluso",
]);

export const entryStatus = pgEnum("entry_status", [
  "bozza",
  "confermata",
  "check_in",
  "in_campo",
  "completata",
  // terminali alternativi
  "ritirata",
  "assente",
]);

export const runStatus = pgEnum("run_status", [
  "attesa",
  "in_inserimento",
  "in_attesa_firma",
  "validata",
  "pubblicata",
]);

// BR-27: chiusura ≠ firma. La chiusura è l'annuncio (provvisorio, sincronizza);
// la firma ufficializza, tipicamente in batch a fine classe. La sincronizzazione
// è trasporto, non stato: la registra server_received_at.
export const scoreCardStatus = pgEnum("score_card_status", [
  "in_compilazione",
  "chiusa",
  "firmata",
  "validata",
]);

// BR-28: una carta può nascere dal flusso digitale o dal backfill della
// carta cartacea (modalità degradata).
export const scoreCardSource = pgEnum("score_card_source", [
  "digital",
  "manual_backfill",
]);

// Esiti speciali: sostituiscono il punteggio calcolato (BR-23).
export const scoreCardSpecial = pgEnum("score_card_special", [
  "score_0",
  "no_score",
]);

// Ciclo di vita del draw di una classe (flusso E).
export const drawStatus = pgEnum("draw_status", [
  "nessuno",
  "generato", // bozza: re-draw libero
  "pubblicato", // congelato: solo chirurgia tracciata (BR-43)
]);

export const entryGait = pgEnum("entry_gait", [
  "walk_in",
  "trot_in",
  "lope_in",
]);

// Vocabolario dal patternbook, allineato a reference/patterns.json.
export const maneuverType = pgEnum("maneuver_type", [
  "rundown",
  "rollback",
  "stop",
  "backup",
  "spin",
  "circles",
  "lead_change",
  "figure_8",
  "hesitate",
]);

export const championship = pgEnum("championship", [
  "debuttanti",
  "italiano",
  "assoluto",
  "facoltative",
]);

// Vocabolario proprietà cavallo da reference/categories.json (BR-14).
export const horseOwnership = pgEnum("horse_ownership", [
  "di_proprieta",
  "non_di_proprieta",
  "non_di_proprieta_o_di_proprieta_per_np",
  "non_di_proprieta_per_pro_di_proprieta_per_np",
  "libera",
]);
