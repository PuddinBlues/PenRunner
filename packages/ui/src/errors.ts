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
 * PONTE verso l'inglese per i messaggi di dominio del server (oggi solo
 * italiani): traduzione per corrispondenza esatta o pattern. È un ponte
 * dichiarato — la via lunga è l'i18n lato server — ma finché esiste vale la
 * regola: un messaggio NON in mappa esce com'è (mai peggio di prima).
 */
const SERVER_MESSAGES_EN: Array<[RegExp, string]> = [
  [/^Credenziali non valide$/, "Invalid credentials"],
  [/^Account sospeso$/, "Account suspended"],
  [/^Email non verificata$/, "Email not verified"],
  [/^Registrazione non riuscita$/, "Registration failed"],
  [/^Token non valido o scaduto$/, "Invalid or expired link"],
  [/^Codice non corretto$/, "Incorrect code"],
  [/^Troppi tentativi: richiedi un nuovo codice$/, "Too many attempts: request a new code"],
  [/^Troppi tentativi: riprova tra qualche minuto$/, "Too many attempts: try again in a few minutes"],
  [/^Questo cavallo è già iscritto a questa classe$/, "This horse is already entered in this class"],
  [/^«(.+)» è già iscritto a «(.+)»$/, "“$1” is already entered in “$2”"],
  [
    /^«(.+)» risulta già iscritto a «(.+)» e poi ritirato: per rientrare parla con la segreteria dello show$/,
    "“$1” was entered in “$2” and then scratched: to re-enter, talk to the show office",
  ],
  [/^Solo un'iscrizione in bozza si può confermare$/, "Only a draft entry can be confirmed"],
  [/^Un'iscrizione massiva riguarda un solo evento$/, "A bulk entry covers a single event"],
  [/^Invito non valido, scaduto o revocato$/, "Invite invalid, expired or revoked"],
  [/^Completa prima il profilo$/, "Complete your profile first"],
  [/^Hai già un profilo collegato$/, "You already have a linked profile"],
];

/**
 * Il messaggio da mostrare all'utente, nella lingua corrente dell'app
 * (stessa persistenza del selettore i18n). Firma invariata rispetto alla
 * vecchia errorMessage: i chiamanti non cambiano.
 */
export function errorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const locale = detectLocale();
  const issues = parseZodIssues(raw);
  if (!issues) {
    if (locale === "en") {
      for (const [re, en] of SERVER_MESSAGES_EN) {
        if (re.test(raw)) return raw.replace(re, en);
      }
    }
    return raw;
  }
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
export const PASSWORD_MIN_LENGTH = 8;
