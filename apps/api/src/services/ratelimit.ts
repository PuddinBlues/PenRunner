import { TRPCError } from "@trpc/server";

// ---------------------------------------------------------------------------
// Rate-limit in-process per le mutazioni auth (siamo su internet pubblico):
// finestra scorrevole per chiave ip+bucket. Coerente con l'assunzione MVP di
// istanza singola (come il liveBus); multi-istanza → store condiviso.
// ---------------------------------------------------------------------------

const hits = new Map<string, number[]>();

export interface RateLimitRule {
  bucket: string;
  /** tentativi ammessi nella finestra */
  limit: number;
  windowMs: number;
}

/** Lancia TOO_MANY_REQUESTS oltre il limite. Senza IP (test/caller interni) non limita. */
export function rateLimit(
  ip: string | undefined,
  rule: RateLimitRule,
  now = Date.now(),
): void {
  if (!ip) return;
  const key = `${rule.bucket}:${ip}`;
  const windowStart = now - rule.windowMs;
  const recent = (hits.get(key) ?? []).filter((t) => t > windowStart);
  if (recent.length >= rule.limit) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Troppi tentativi: riprova tra qualche minuto",
    });
  }
  recent.push(now);
  hits.set(key, recent);
}

export const AUTH_LIMITS = {
  login: { bucket: "auth.login", limit: 10, windowMs: 60_000 },
  register: { bucket: "auth.register", limit: 5, windowMs: 60_000 },
  passwordReset: { bucket: "auth.reset", limit: 5, windowMs: 60_000 },
} as const;

/** Per i test: azzera lo stato del limiter. */
export function resetRateLimits(): void {
  hits.clear();
}
