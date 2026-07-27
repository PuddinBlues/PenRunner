import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  DevMailer,
  ResendMailer,
  SmtpMailer,
  makeMailer,
} from "../src/services/mailer.js";
import { PAYBACK_A } from "../src/services/payback.js";
import {
  AUTH_LIMITS,
  rateLimit,
  resetRateLimits,
} from "../src/services/ratelimit.js";

// ---------------------------------------------------------------------------
// Hardening per l'internet pubblico: selezione mailer da env (fallire
// all'avvio, non in gara) e rate-limit auth in-process.
// ---------------------------------------------------------------------------

describe("makeMailer (MAILER=dev|smtp)", () => {
  it("default: dev (log a video, token leggibile)", () => {
    expect(makeMailer({})).toBeInstanceOf(DevMailer);
    expect(makeMailer({ MAILER: "dev" })).toBeInstanceOf(DevMailer);
  });

  it("smtp senza credenziali → errore all'avvio, esplicito", () => {
    expect(() => makeMailer({ MAILER: "smtp" })).toThrow(
      /SMTP_HOST.*SMTP_USER.*SMTP_PASS.*MAIL_FROM/,
    );
  });

  it("smtp completo → SmtpMailer (Resend-ready)", () => {
    const mailer = makeMailer({
      MAILER: "smtp",
      SMTP_HOST: "smtp.resend.com",
      SMTP_USER: "resend",
      SMTP_PASS: "re_test_key",
      MAIL_FROM: "PenRunner <noreply@penrunner.com>",
    });
    expect(mailer).toBeInstanceOf(SmtpMailer);
  });

  it("resend (API HTTP, porta 443: per i PaaS che bloccano l'egress SMTP)", () => {
    const mailer = makeMailer({
      MAILER: "resend",
      RESEND_API_KEY: "re_test_key",
      MAIL_FROM: "PenRunner <noreply@penrunner.com>",
    });
    expect(mailer).toBeInstanceOf(ResendMailer);
  });

  it("resend senza chiave → errore all'avvio con l'elenco", () => {
    expect(() => makeMailer({ MAILER: "resend" })).toThrow(
      /RESEND_API_KEY.*MAIL_FROM/,
    );
  });

  it("valore sconosciuto → errore, non un default silenzioso", () => {
    expect(() => makeMailer({ MAILER: "sendgrid" })).toThrow(
      /sconosciuto.*dev, resend, smtp/,
    );
  });
});

describe("rate-limit auth (finestra scorrevole per IP)", () => {
  afterEach(resetRateLimits);

  it("oltre il limite → TOO_MANY_REQUESTS; IP diversi indipendenti", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < AUTH_LIMITS.login.limit; i++) {
      rateLimit("1.2.3.4", AUTH_LIMITS.login, t0 + i);
    }
    expect(() => rateLimit("1.2.3.4", AUTH_LIMITS.login, t0 + 50)).toThrow(
      /Troppi tentativi/,
    );
    // un altro IP non è toccato
    expect(() => rateLimit("5.6.7.8", AUTH_LIMITS.login, t0 + 50)).not.toThrow();
  });

  it("la finestra scorre: passato il minuto si riprova", () => {
    const t0 = 2_000_000;
    for (let i = 0; i < AUTH_LIMITS.login.limit; i++) {
      rateLimit("9.9.9.9", AUTH_LIMITS.login, t0);
    }
    expect(() =>
      rateLimit("9.9.9.9", AUTH_LIMITS.login, t0 + AUTH_LIMITS.login.windowMs + 1),
    ).not.toThrow();
  });

  it("senza IP (caller interni/test) non limita", () => {
    for (let i = 0; i < 100; i++) {
      expect(() => rateLimit(undefined, AUTH_LIMITS.register)).not.toThrow();
    }
  });
});

describe("contratto dell'immagine Docker (letture runtime dal filesystem)", () => {
  // Inventario delle cartelle lette a RUNTIME fuori da node_modules — nato
  // dal crash in staging (reference/ non copiata). Chi aggiunge una lettura
  // deve aggiungerla QUI e nel Dockerfile: questo test rompe in CI, non in
  // produzione.
  const RUNTIME_DIRS = [
    "reference", // payback.ts (Payback A), seed (patterns/categories)
    "packages/db", // migrazioni drizzle/ al boot
    "packages/core",
    "apps/api",
  ];

  it("il Dockerfile copia ogni cartella dell'inventario", () => {
    const dockerfile = readFileSync(
      fileURLToPath(new URL("../Dockerfile", import.meta.url)),
      "utf-8",
    );
    for (const dir of RUNTIME_DIRS) {
      expect(dockerfile, `manca COPY ${dir}`).toMatch(
        new RegExp(`^COPY ${dir} `, "m"),
      );
    }
  });

  it("la tabella Payback A si carica (fail-fast del boot)", () => {
    expect(PAYBACK_A.length).toBeGreaterThan(0);
  });
});
