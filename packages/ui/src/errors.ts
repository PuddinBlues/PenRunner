import { detectLocale, type Locale } from "./i18n.js";

// ---------------------------------------------------------------------------
// Chokepoint degli errori mostrati nei form (reperto staging: l'errore Zod
// grezzo — JSON con code/minimum/path — a video sotto il campo password).
// tRPC serializza le issue Zod come array JSON nel message: qui si riconosce
// e si traduce in linguaggio umano IT/EN. REGOLA: fallback SEMPRE al
// messaggio originale — mai peggio di prima.
// ---------------------------------------------------------------------------

interface ZodIssueLike {
  code?: string;
  message?: string;
  path?: Array<string | number>;
  minimum?: number;
  maximum?: number;
  type?: string;
  validation?: string;
}

const FIELD_LABELS: Record<Locale, Record<string, string>> = {
  it: { password: "Password", email: "Email", fullName: "Nome" },
  en: { password: "Password", email: "Email", fullName: "Name" },
};

function translateIssue(issue: ZodIssueLike, locale: Locale): string | null {
  // I messaggi CUSTOM dei nostri schemi (es. "Importo non valido…") passano
  // intatti: si traduce per codice solo quando il testo è il default Zod.
  const isDefault =
    typeof issue.message === "string" &&
    /^(String must|Invalid|Required|Number must|Expected)/.test(issue.message);
  if (!isDefault) return issue.message ?? null;

  const field = issue.path?.filter((p) => typeof p === "string").at(-1);
  const label =
    (field && FIELD_LABELS[locale][field as string]) ??
    (typeof field === "string" ? field : null);
  const prefix = label ? `${label}: ` : "";

  if (issue.code === "too_small" && issue.type === "string") {
    return locale === "it"
      ? `${prefix}minimo ${issue.minimum} caratteri`
      : `${prefix}at least ${issue.minimum} characters`;
  }
  if (issue.code === "too_big" && issue.type === "string") {
    return locale === "it"
      ? `${prefix}massimo ${issue.maximum} caratteri`
      : `${prefix}at most ${issue.maximum} characters`;
  }
  if (issue.code === "invalid_string" && issue.validation === "email") {
    return locale === "it" ? "Indirizzo email non valido" : "Invalid email address";
  }
  if (issue.code === "invalid_type" && issue.message === "Required") {
    return locale === "it"
      ? `${prefix}campo obbligatorio`
      : `${prefix}required field`;
  }
  return issue.message ?? null;
}

/** Prova a interpretare il message come array di issue Zod (formato tRPC). */
function parseZodIssues(message: string): ZodIssueLike[] | null {
  const trimmed = message.trim();
  if (!trimmed.startsWith("[")) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (
      Array.isArray(parsed) &&
      parsed.length > 0 &&
      parsed.every((i) => typeof i === "object" && i !== null && "message" in i)
    ) {
      return parsed as ZodIssueLike[];
    }
  } catch {
    /* non è JSON: non era Zod */
  }
  return null;
}

/**
 * Il messaggio da mostrare all'utente, nella lingua corrente dell'app
 * (stessa persistenza del selettore i18n). Firma invariata rispetto alla
 * vecchia errorMessage: i chiamanti non cambiano.
 */
export function errorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const issues = parseZodIssues(raw);
  if (!issues) return raw;
  const locale = detectLocale();
  const translated = issues
    .map((i) => translateIssue(i, locale))
    .filter((s): s is string => Boolean(s));
  return translated.length > 0 ? [...new Set(translated)].join(" · ") : raw;
}

/**
 * Vincolo password dell'API, mostrato PRIMA dell'errore (hint sotto il
 * campo). Un test in apps/api pinna questa costante contro passwordSchema:
 * il drift rompe un test, non un utente.
 */
export const PASSWORD_MIN_LENGTH = 10;
