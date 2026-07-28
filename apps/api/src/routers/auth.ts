import { randomInt } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { schema } from "@penrunner/db";
import { appUrl, type ClientApp } from "../config/urls.js";
import {
  generateToken,
  hashPassword,
  hashToken,
  verifyPassword,
} from "../services/crypto.js";
import { renderMail } from "../services/mailtemplate.js";
import { AUTH_LIMITS, rateLimit } from "../services/ratelimit.js";
import {
  createUserSession,
  revokeAllUserSessions,
  revokeSession,
} from "../services/sessions.js";
import { publicProcedure, router, userProcedure } from "../trpc.js";

// BR-82 (verifica a doppia via): TTL SDOPPIATI — il link firmato (token
// lungo, non indovinabile) vale 24h per non punire chi apre l'email la sera;
// il codice a 6 cifre (indovinabile per costruzione) vale 30' con max 5
// tentativi, poi si rigenera.
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const EMAIL_CODE_TTL_MS = 30 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

const emailSchema = z.string().email().transform((v) => v.toLowerCase());
const passwordSchema = z.string().min(10).max(200);
const clientSchema = z.enum(["organizer", "stable"]).default("organizer");
const localeSchema = z.enum(["it", "en"]).default("it");

function generateShortCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

async function issueAuthToken(
  db: Parameters<typeof createUserSession>[0],
  userId: string,
  purpose: "email_verification" | "password_reset",
  ttlMs: number,
  opts: { withCode?: boolean } = {},
) {
  const token = generateToken();
  const code = opts.withCode ? generateShortCode() : null;
  await db.insert(schema.authTokens).values({
    userId,
    purpose,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + ttlMs),
    codeHash: code ? hashToken(code) : null,
    codeExpiresAt: code ? new Date(Date.now() + EMAIL_CODE_TTL_MS) : null,
  });
  return { token, code };
}

async function sendVerificationMail(
  mailer: { send: (m: import("../services/mailer.js").MailMessage) => Promise<void> },
  to: string,
  token: string,
  code: string,
  client: ClientApp,
  locale: "it" | "en",
) {
  const url = `${appUrl(client)}/?verify=${token}`;
  const { text, html } = renderMail(locale, {
    heading:
      locale === "it" ? "Benvenuto su PenRunner" : "Welcome to PenRunner",
    paragraphs:
      locale === "it"
        ? [
            "Conferma il tuo indirizzo email per attivare l'account.",
            `Se leggi da un altro dispositivo, inserisci il codice qui sotto nell'app (vale 30 minuti).`,
          ]
        : [
            "Confirm your email address to activate your account.",
            "Reading on another device? Type the code below into the app (valid for 30 minutes).",
          ],
    cta: {
      label: locale === "it" ? "Conferma l'email" : "Confirm email",
      url,
    },
    code,
    fallbackLines: [`token: ${token}`],
  });
  await mailer.send({
    to,
    subject:
      locale === "it"
        ? "Conferma il tuo indirizzo email"
        : "Confirm your email address",
    body: text,
    html,
  });
}

export const authRouter = router({
  register: publicProcedure
    .input(
      z.object({
        email: emailSchema,
        password: passwordSchema,
        client: clientSchema,
        locale: localeSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      rateLimit(ctx.ip, AUTH_LIMITS.register);
      const [existing] = await ctx.db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(sql`lower(${schema.users.email}) = ${input.email}`);
      if (existing) {
        // Nessun oracolo sull'esistenza dell'account.
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Registrazione non riuscita",
        });
      }
      const [user] = await ctx.db
        .insert(schema.users)
        .values({
          email: input.email,
          passwordHash: await hashPassword(input.password),
        })
        .returning();
      const { token, code } = await issueAuthToken(
        ctx.db,
        user!.id,
        "email_verification",
        EMAIL_VERIFICATION_TTL_MS,
        { withCode: true },
      );
      await sendVerificationMail(
        ctx.mailer,
        input.email,
        token,
        code!,
        input.client,
        input.locale,
      );
      return { userId: user!.id };
    }),

  // La verifica è il prerequisito del claim: l'email è la chiave con cui si
  // rivendica un profilo esistente, quindi prima va dimostrato di possederla.
  // BR-82, doppia via: link firmato (token, 24h) O coppia email+codice
  // (6 cifre, 30', max 5 tentativi poi si rigenera). Il codice non vale
  // MAI da solo.
  verifyEmail: publicProcedure
    .input(
      z.union([
        z.object({ token: z.string().min(1) }),
        z.object({ email: emailSchema, code: z.string().regex(/^\d{6}$/) }),
      ]),
    )
    .mutation(async ({ ctx, input }) => {
      rateLimit(ctx.ip, AUTH_LIMITS.verify);
      const now = new Date();
      let row: typeof schema.authTokens.$inferSelect | undefined;

      if ("token" in input) {
        [row] = await ctx.db
          .select()
          .from(schema.authTokens)
          .where(
            and(
              eq(schema.authTokens.tokenHash, hashToken(input.token)),
              eq(schema.authTokens.purpose, "email_verification"),
              isNull(schema.authTokens.consumedAt),
              gt(schema.authTokens.expiresAt, now),
            ),
          );
      } else {
        // Ultimo token attivo dell'utente con codice ancora valido.
        const [candidate] = await ctx.db
          .select({ tokenRow: schema.authTokens })
          .from(schema.authTokens)
          .innerJoin(schema.users, eq(schema.users.id, schema.authTokens.userId))
          .where(
            and(
              sql`lower(${schema.users.email}) = ${input.email}`,
              eq(schema.authTokens.purpose, "email_verification"),
              isNull(schema.authTokens.consumedAt),
              gt(schema.authTokens.codeExpiresAt, now),
            ),
          )
          .orderBy(sql`${schema.authTokens.createdAt} desc`)
          .limit(1);
        const t = candidate?.tokenRow;
        if (t && t.codeHash === hashToken(input.code)) {
          row = t;
        } else if (t) {
          // Tentativo errato: si conta; al quinto il codice muore e si
          // rigenera dalla schermata di verifica (mai un blocco muto).
          const attempts = t.attempts + 1;
          await ctx.db
            .update(schema.authTokens)
            .set({
              attempts,
              ...(attempts >= MAX_CODE_ATTEMPTS ? { consumedAt: now } : {}),
            })
            .where(eq(schema.authTokens.id, t.id));
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              attempts >= MAX_CODE_ATTEMPTS
                ? "Troppi tentativi: richiedi un nuovo codice"
                : "Codice non corretto",
          });
        }
      }

      if (!row) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Token non valido o scaduto",
        });
      }
      const rowId = row.id;
      const rowUserId = row.userId;
      await ctx.db.transaction(async (tx) => {
        await tx
          .update(schema.authTokens)
          .set({ consumedAt: now })
          .where(eq(schema.authTokens.id, rowId));
        await tx
          .update(schema.users)
          .set({ emailVerifiedAt: now })
          .where(eq(schema.users.id, rowUserId));
      });
      return { verified: true };
    }),

  /**
   * BR-82: rigenerazione self-serve del codice/link (codice scaduto o
   * bruciato). Nessun oracolo: risponde ok anche se l'email non esiste o è
   * già verificata.
   */
  resendVerification: publicProcedure
    .input(
      z.object({
        email: emailSchema,
        client: clientSchema,
        locale: localeSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      rateLimit(ctx.ip, AUTH_LIMITS.resend);
      const [user] = await ctx.db
        .select()
        .from(schema.users)
        .where(sql`lower(${schema.users.email}) = ${input.email}`);
      if (!user || user.emailVerifiedAt) return { ok: true };
      // I token precedenti muoiono: UN solo codice attivo per volta.
      await ctx.db
        .update(schema.authTokens)
        .set({ consumedAt: new Date() })
        .where(
          and(
            eq(schema.authTokens.userId, user.id),
            eq(schema.authTokens.purpose, "email_verification"),
            isNull(schema.authTokens.consumedAt),
          ),
        );
      const { token, code } = await issueAuthToken(
        ctx.db,
        user.id,
        "email_verification",
        EMAIL_VERIFICATION_TTL_MS,
        { withCode: true },
      );
      await sendVerificationMail(
        ctx.mailer,
        input.email,
        token,
        code!,
        input.client,
        input.locale,
      );
      return { ok: true };
    }),

  login: publicProcedure
    .input(z.object({ email: emailSchema, password: z.string() }))
    .mutation(async ({ ctx, input }) => {
      rateLimit(ctx.ip, AUTH_LIMITS.login);
      const [user] = await ctx.db
        .select()
        .from(schema.users)
        .where(sql`lower(${schema.users.email}) = ${input.email}`);
      const invalid = new TRPCError({
        code: "UNAUTHORIZED",
        message: "Credenziali non valide",
      });
      if (!user) throw invalid;
      if (!(await verifyPassword(user.passwordHash, input.password))) {
        throw invalid;
      }
      if (user.suspendedAt) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Account sospeso" });
      }
      const sessionToken = await createUserSession(ctx.db, user.id);
      return { sessionToken };
    }),

  logout: userProcedure.mutation(async ({ ctx }) => {
    if (ctx.sessionId) await revokeSession(ctx.db, ctx.sessionId);
    return { loggedOut: true };
  }),

  // Il reset resta a SOLO link (più sensibile del verify: niente codice
  // breve, BR-82 vale per la sola verifica email).
  requestPasswordReset: publicProcedure
    .input(
      z.object({
        email: emailSchema,
        client: clientSchema,
        locale: localeSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      rateLimit(ctx.ip, AUTH_LIMITS.passwordReset);
      const [user] = await ctx.db
        .select()
        .from(schema.users)
        .where(sql`lower(${schema.users.email}) = ${input.email}`);
      if (user) {
        const { token } = await issueAuthToken(
          ctx.db,
          user.id,
          "password_reset",
          PASSWORD_RESET_TTL_MS,
        );
        const url = `${appUrl(input.client)}/?reset=${token}`;
        const { text, html } = renderMail(input.locale, {
          heading:
            input.locale === "it" ? "Reimposta la password" : "Reset your password",
          paragraphs:
            input.locale === "it"
              ? ["Hai chiesto di reimpostare la password. Il link vale 1 ora; se non sei stato tu, ignora questa email."]
              : ["You asked to reset your password. The link is valid for 1 hour; if it wasn't you, ignore this email."],
          cta: {
            label: input.locale === "it" ? "Scegli una nuova password" : "Choose a new password",
            url,
          },
          fallbackLines: [`token: ${token}`],
        });
        await ctx.mailer.send({
          to: input.email,
          subject:
            input.locale === "it" ? "Reimposta la password" : "Reset your password",
          body: text,
          html,
        });
      }
      // Risposta identica in ogni caso: nessun oracolo.
      return { requested: true };
    }),

  resetPassword: publicProcedure
    .input(z.object({ token: z.string().min(1), newPassword: passwordSchema }))
    .mutation(async ({ ctx, input }) => {
      const now = new Date();
      const [row] = await ctx.db
        .select()
        .from(schema.authTokens)
        .where(
          and(
            eq(schema.authTokens.tokenHash, hashToken(input.token)),
            eq(schema.authTokens.purpose, "password_reset"),
            isNull(schema.authTokens.consumedAt),
            gt(schema.authTokens.expiresAt, now),
          ),
        );
      if (!row) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Token non valido o scaduto",
        });
      }
      await ctx.db.transaction(async (tx) => {
        await tx
          .update(schema.authTokens)
          .set({ consumedAt: now })
          .where(eq(schema.authTokens.id, row.id));
        await tx
          .update(schema.users)
          .set({ passwordHash: await hashPassword(input.newPassword) })
          .where(eq(schema.users.id, row.userId));
      });
      await revokeAllUserSessions(ctx.db, row.userId);
      return { reset: true };
    }),
});
