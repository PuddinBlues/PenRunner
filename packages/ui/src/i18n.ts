// ---------------------------------------------------------------------------
// Fabbrica i18n condivisa (BR-60..62): ogni app porta il SUO catalogo it/en,
// qui vivono solo la meccanica (interpolazione {var}) e la scelta del locale
// (persistita, default dal device: it → italiano, altro → inglese).
// ---------------------------------------------------------------------------

export const LOCALES = ["it", "en"] as const;
export type Locale = (typeof LOCALES)[number];

const STORAGE_KEY = "penrunner_locale";

export function detectLocale(): Locale {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "it" || stored === "en") return stored;
  return navigator.language?.toLowerCase().startsWith("it") ? "it" : "en";
}

export function persistLocale(locale: Locale): void {
  localStorage.setItem(STORAGE_KEY, locale);
}

export function makeTranslator<K extends string>(
  messages: Record<Locale, Record<K, string>>,
) {
  return (locale: Locale) =>
    (key: K, vars?: Record<string, string | number>) => {
      let s: string = messages[locale][key];
    if (vars) {
      // plurale minimale: {chiave:singolare|plurale} sceglie in base al valore
      s = s.replace(/\{(\w+):([^|{}]*)\|([^{}]*)\}/g, (_m, k, one, many) =>
        Number(vars[k]) === 1 ? one : many,
      );
      for (const [k, v] of Object.entries(vars))
        s = s.replace(`{${k}}`, String(v));
    }
      return s;
    };
}
