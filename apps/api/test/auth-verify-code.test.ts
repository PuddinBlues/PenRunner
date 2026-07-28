import { and, eq, isNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@penrunner/db";
// Subpath senza React: il pin della costante non deve trascinarsi i componenti.
import { PASSWORD_MIN_LENGTH } from "@penrunner/ui/errors";
import { extractToken, type MailMessage } from "../src/services/mailer.js";
import { setupApi, type TestApi } from "./helpers.js";

// ---------------------------------------------------------------------------
// BR-82 — verifica email a doppia via: link firmato (token lungo, 24h) come
// via principale, codice a 6 cifre (30', max 5 tentativi) per chi legge
// l'email su un altro dispositivo. Il codice non vale MAI da solo: solo in
// coppia con l'email.
// ---------------------------------------------------------------------------

let api: TestApi;

beforeAll(async () => {
  api = await setupApi();
});

afterAll(async () => {
  await api.close();
});

/** Il codice a 6 cifre dal testo plain ("Codice: 123456" / "Code: 123456"). */
function extractCode(message: MailMessage): string {
  const match = message.body.match(/(?:Codice|Code): (\d{6})/);
  if (!match) throw new Error("Nessun codice nel messaggio");
  return match[1]!;
}

async function activeVerificationTokens(email: string) {
  const [user] = await api.db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email));
  return api.db
    .select()
    .from(schema.authTokens)
    .where(
      and(
        eq(schema.authTokens.userId, user!.id),
        eq(schema.authTokens.purpose, "email_verification"),
        isNull(schema.authTokens.consumedAt),
      ),
    );
}

describe("BR-82: verifica con codice a 6 cifre", () => {
  it("la coppia email+codice verifica l'account", async () => {
    const anon = await api.as();
    await anon.auth.register({
      email: "codice@example.com",
      password: "password-di-test",
    });
    const mail = api.mailer.lastTo("codice@example.com")!;
    const code = extractCode(mail);
    // Nell'email ci sono ENTRAMBE le vie: link (token) e codice.
    expect(() => extractToken(mail)).not.toThrow();

    const { verified } = await anon.auth.verifyEmail({
      email: "codice@example.com",
      code,
    });
    expect(verified).toBe(true);
    const { sessionToken } = await anon.auth.login({
      email: "codice@example.com",
      password: "password-di-test",
    });
    expect(sessionToken).toBeTruthy();
  });

  it("il codice giusto con l'email sbagliata non verifica nessuno", async () => {
    const anon = await api.as();
    await anon.auth.register({
      email: "giusto@example.com",
      password: "password-di-test",
    });
    await anon.auth.register({
      email: "altro@example.com",
      password: "password-di-test",
    });
    const code = extractCode(api.mailer.lastTo("giusto@example.com")!);
    await expect(
      anon.auth.verifyEmail({ email: "altro@example.com", code }),
    ).rejects.toThrow(/Codice non corretto|non valido/);
  });

  it("5 tentativi errati bruciano il codice E il token, con messaggio che indica il resend", async () => {
    const anon = await api.as();
    await anon.auth.register({
      email: "brute@example.com",
      password: "password-di-test",
    });
    const mail = api.mailer.lastTo("brute@example.com")!;
    const code = extractCode(mail);
    const token = extractToken(mail);
    const wrong = code === "000000" ? "000001" : "000000";

    for (let i = 0; i < 4; i++) {
      await expect(
        anon.auth.verifyEmail({ email: "brute@example.com", code: wrong }),
      ).rejects.toThrow(/Codice non corretto/);
    }
    await expect(
      anon.auth.verifyEmail({ email: "brute@example.com", code: wrong }),
    ).rejects.toThrow(/Troppi tentativi: richiedi un nuovo codice/);

    // Il token è la STESSA riga: bruciata anche la via del link — un
    // attaccante che esaurisce i tentativi non lascia una porta aperta.
    await expect(
      anon.auth.verifyEmail({ email: "brute@example.com", code }),
    ).rejects.toThrow(/non valido o scaduto/);
    await expect(anon.auth.verifyEmail({ token })).rejects.toThrow(
      /non valido o scaduto/,
    );
  });

  it("resend: il vecchio codice muore, il nuovo verifica (un solo codice attivo)", async () => {
    const anon = await api.as();
    await anon.auth.register({
      email: "resend@example.com",
      password: "password-di-test",
    });
    const oldCode = extractCode(api.mailer.lastTo("resend@example.com")!);

    await anon.auth.resendVerification({ email: "resend@example.com" });
    const active = await activeVerificationTokens("resend@example.com");
    expect(active).toHaveLength(1);

    const newCode = extractCode(api.mailer.lastTo("resend@example.com")!);
    if (oldCode !== newCode) {
      await expect(
        anon.auth.verifyEmail({ email: "resend@example.com", code: oldCode }),
      ).rejects.toThrow(/Codice non corretto|non valido/);
    }
    const { verified } = await anon.auth.verifyEmail({
      email: "resend@example.com",
      code: newCode,
    });
    expect(verified).toBe(true);
  });

  it("resend senza oracolo: ok anche per email inesistente o già verificata", async () => {
    const anon = await api.as();
    await expect(
      anon.auth.resendVerification({ email: "fantasma@example.com" }),
    ).resolves.toEqual({ ok: true });
    // resend@example.com è verificata dal test sopra: nessuna nuova email.
    const before = api.mailer.sent.length;
    await expect(
      anon.auth.resendVerification({ email: "resend@example.com" }),
    ).resolves.toEqual({ ok: true });
    expect(api.mailer.sent.length).toBe(before);
  });

  it("TTL sdoppiati: codice scaduto ma link ancora valido (24h vs 30')", async () => {
    const anon = await api.as();
    await anon.auth.register({
      email: "sera@example.com",
      password: "password-di-test",
    });
    const mail = api.mailer.lastTo("sera@example.com")!;
    const code = extractCode(mail);
    const token = extractToken(mail);

    // Simula il passaggio di un'ora: il codice è morto, il link no.
    const [row] = await activeVerificationTokens("sera@example.com");
    await api.db
      .update(schema.authTokens)
      .set({ codeExpiresAt: new Date(Date.now() - 60 * 60 * 1000) })
      .where(eq(schema.authTokens.id, row!.id));

    await expect(
      anon.auth.verifyEmail({ email: "sera@example.com", code }),
    ).rejects.toThrow(/non valido o scaduto/);
    const { verified } = await anon.auth.verifyEmail({ token });
    expect(verified).toBe(true);
  });

  it("il codice in chiaro non è in banca dati (solo hash)", async () => {
    const anon = await api.as();
    await anon.auth.register({
      email: "hash@example.com",
      password: "password-di-test",
    });
    const code = extractCode(api.mailer.lastTo("hash@example.com")!);
    const [row] = await activeVerificationTokens("hash@example.com");
    expect(row!.codeHash).toBeTruthy();
    expect(row!.codeHash).not.toContain(code);
    expect(row!.codeExpiresAt).toBeInstanceOf(Date);
  });
});

describe("auth.me — il gate delle shell (fix vicolo cieco non-verificato)", () => {
  it("senza sessione → UNAUTHORIZED", async () => {
    const anon = await api.as();
    await expect(anon.auth.me()).rejects.toThrow(/UNAUTHORIZED/);
  });

  it("loggato NON verificato → emailVerified false; dopo la verifica → true", async () => {
    const anon = await api.as();
    await anon.auth.register({
      email: "gate@example.com",
      password: "password-di-test",
    });
    // Il login NON richiede la verifica: è esattamente lo scenario che
    // lasciava l'utente nel vicolo cieco.
    const { sessionToken } = await anon.auth.login({
      email: "gate@example.com",
      password: "password-di-test",
    });
    const caller = await api.as(sessionToken);
    expect(await caller.auth.me()).toEqual({
      email: "gate@example.com",
      emailVerified: false,
    });

    const code = extractCode(api.mailer.lastTo("gate@example.com")!);
    await caller.auth.verifyEmail({ email: "gate@example.com", code });
    const fresh = await api.as(sessionToken);
    expect((await fresh.auth.me()).emailVerified).toBe(true);
  });
});

describe("vincolo password condiviso UI/API", () => {
  it(`PASSWORD_MIN_LENGTH (${PASSWORD_MIN_LENGTH}) pinna passwordSchema: N-1 rifiutata, N accettata`, async () => {
    const anon = await api.as();
    await expect(
      anon.auth.register({
        email: "corta@example.com",
        password: "a".repeat(PASSWORD_MIN_LENGTH - 1),
      }),
    ).rejects.toThrow(/too_small|at least|minimo/i);
    await expect(
      anon.auth.register({
        email: "corta@example.com",
        password: "a".repeat(PASSWORD_MIN_LENGTH),
      }),
    ).resolves.toHaveProperty("userId");
  });
});
