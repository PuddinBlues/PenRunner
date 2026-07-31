// ---------------------------------------------------------------------------
// B3 (BR-94): copy umano SERVER-SIDE dei controlli di eleggibilità, per le
// email "avvisa la scuderia" — nella lingua del destinatario (BR-62). È lo
// specchio dei cataloghi warn.* delle app: il codice semantico attraversa il
// confine, il testo no (fase 1a). Un codice nuovo senza copy cade sul
// `message` italiano dell'evaluator: mai una email vuota.
// ---------------------------------------------------------------------------

import type { EligibilityWarning } from "../eligibility.js";

type Lang = "it" | "en";

const COPY: Record<string, Record<Lang, (p: Record<string, string>) => string>> = {
  fise_license_missing: {
    it: (p) =>
      `Patente FISE mancante o non adatta${p.required ? ` (richiesta: ${p.required})` : ""}. Aggiorna il profilo del cavaliere nel roster.`,
    en: (p) =>
      `FISE license missing or not suitable${p.required ? ` (required: ${p.required})` : ""}. Update the rider's profile in your roster.`,
  },
  irha_membership_missing: {
    it: () => "Tesseramento IRHA mancante. Aggiorna il profilo del cavaliere nel roster.",
    en: () => "IRHA membership missing. Update the rider's profile in your roster.",
  },
  age_birthdate_missing: {
    it: () =>
      "Data di nascita mancante: impossibile verificare i limiti d'età. Aggiungila dal roster.",
    en: () =>
      "Birth date missing: age limits cannot be checked. Add it from your roster.",
  },
  age_out_of_limit: {
    it: () =>
      "L'età del cavaliere è fuori dai limiti della categoria. Verifica la categoria scelta con la segreteria.",
    en: () =>
      "The rider's age is outside the category limits. Check the chosen category with the show office.",
  },
  horse_ownership: {
    it: () =>
      "La categoria richiede la proprietà del cavallo e l'intestazione non risulta. Verifica con la segreteria.",
    en: () =>
      "The category requires horse ownership and it does not match. Check with the show office.",
  },
  horse_ownership_conditional: {
    it: () =>
      "La proprietà del cavallo va verificata per questa categoria. Porta i documenti al check-in.",
    en: () =>
      "Horse ownership needs verification for this category. Bring the papers to check-in.",
  },
  rider_earnings_cap: {
    it: () =>
      "Le vincite del cavaliere superano il tetto della categoria. Verifica l'eleggibilità con la segreteria.",
    en: () =>
      "The rider's earnings exceed the category cap. Check eligibility with the show office.",
  },
  horse_earnings_cap: {
    it: () =>
      "Le vincite del cavallo superano il tetto della categoria. Verifica l'eleggibilità con la segreteria.",
    en: () =>
      "The horse's earnings exceed the category cap. Check eligibility with the show office.",
  },
  tecnico_required: {
    it: () =>
      "Manca l'indicazione del tecnico federale. Comunica il nome alla segreteria o aggiorna l'iscrizione.",
    en: () =>
      "The federal coach is missing. Send the name to the show office or update the entry.",
  },
};

/** Riga umana per un avviso, nella lingua data (fallback: message italiano). */
export function warnLine(w: EligibilityWarning, lang: Lang): string {
  const entry = COPY[w.code];
  if (!entry) return w.message;
  return entry[lang](w.params ?? {});
}
