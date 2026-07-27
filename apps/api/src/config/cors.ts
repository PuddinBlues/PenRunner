// ---------------------------------------------------------------------------
// UNICA fonte delle origini CORS: tRPC, documenti PDF e SSE leggono da qui.
// In sviluppo i quattro localhost delle app; in staging/produzione si imposta
// CORS_ORIGINS (lista separata da virgole, es.
// "https://penrunner.com,https://organizer.penrunner.com").
// ---------------------------------------------------------------------------

const DEV_ORIGINS = [
  "http://localhost:3000", // portale pubblico
  "http://localhost:5173", // scribe
  "http://localhost:5174", // organizer
  "http://localhost:5175", // stable
];

export function corsOrigins(): string[] {
  const fromEnv = process.env.CORS_ORIGINS?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return fromEnv && fromEnv.length > 0 ? fromEnv : DEV_ORIGINS;
}

/**
 * Per le route che scrivono l'header a mano (SSE su reply.raw): l'origine da
 * riflettere, o null se non ammessa. Stessa lista di @fastify/cors — mai una
 * seconda configurazione da dimenticare.
 */
export function resolveCorsOrigin(origin: string | undefined): string | null {
  if (!origin) return null;
  return corsOrigins().includes(origin) ? origin : null;
}
