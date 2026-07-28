import type { MessageKey, T } from "./i18n.js";

// ---------------------------------------------------------------------------
// Confine dei codici (programma qualità, fase a): l'avviso di eleggibilità
// arriva dal server come codice semantico + params e QUI diventa titolo umano
// localizzato + spiegazione. I codici interni non si mostrano mai; per gli
// snapshot storici (codici sconosciuti) si rende il testo di traccia senza
// alcun codice a video.
// ---------------------------------------------------------------------------

const KNOWN = new Set([
  "fise_license_missing",
  "irha_membership_missing",
  "age_birthdate_missing",
  "age_out_of_limit",
  "horse_ownership",
  "horse_ownership_conditional",
  "rider_earnings_cap",
  "horse_earnings_cap",
  "tecnico_required",
]);

export interface WarningLike {
  code?: string;
  message?: string;
  params?: Record<string, string>;
}

export function warningView(
  w: WarningLike,
  t: T,
): { title: string; body: string } {
  if (w.code && KNOWN.has(w.code)) {
    return {
      title: t(`warn.${w.code}.title` as MessageKey),
      body: t(`warn.${w.code}.body` as MessageKey, w.params),
    };
  }
  return { title: t("warn.generic.title" as MessageKey), body: w.message ?? "" };
}
