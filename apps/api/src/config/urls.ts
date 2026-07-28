// ---------------------------------------------------------------------------
// URL pubblici delle app, per i link nelle email transazionali (BR-82: link
// diretto di conferma; invito scribe). Da env in staging/produzione; default
// dev = i localhost delle app. Mai costruiti dall'input del client: il
// client manda solo un ENUM, l'URL lo decide il server (niente open redirect).
// ---------------------------------------------------------------------------

export type ClientApp = "organizer" | "stable";

export function appUrl(client: ClientApp): string {
  if (client === "organizer") {
    return process.env.ORGANIZER_URL ?? "http://localhost:5174";
  }
  return process.env.STABLE_URL ?? "http://localhost:5175";
}

export function scribeUrl(): string {
  return process.env.SCRIBE_URL ?? "http://localhost:5173";
}
