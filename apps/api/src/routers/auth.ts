import { TRPCError } from "@trpc/server";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { schema } from "@penrunner/db";
import {
  generateToken,
  hashPassword,
  hashToken,
  verifyPassword,
} from "../services/crypto.js";
import {
  createUserSession,
  revokeAllUserSessions,
  revokeSession,
} from "../services/sessions.js";
import { publicProcedure, router, userProcedure } from "../trpc.js";

const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

const emailSchema = z.string().email().transform((v) => v.toLowerCase());
const passwordSchema = z.string().min(10).max(200);

async function issueAuthToken(
  db: Parameters<typeof createUserSession>[0],
  userId: string,
  purpose: "email_verification" | "password_reset",
  ttlMs: number,
) {
  const token = generateToken();
  await db.insert(schema.authTokens).values({
    userId,
    purpose,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + ttlMs),
  });
  return token;
}

export const authRouter = router({
  register: publicProcedure
    .input(z.object({ email: emailSchema, password: passwordSchema }))
    .mutation(async ({ ctx, input }) => {
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
      const token = await issueAuthToken(
        ctx.db,
        user!.id,
        "email_verification",
        EMAIL_VERIFICATION_TTL_MS,
      );
      await ctx.mailer.send({
        to: input.email,
        subject: "Conferma il tuo indirizzo email",
        body: `Benvenuto su PenRunner. Conferma l'email con questo token: ${token}`,
      });
      return { userId: user!.id };
    }),

  // La verifica è il prerequisito del claim: l'email è la chiave con cui si
  // rivendica un profilo esistente, quindi prima va dimostrato di possederla.
  verifyEmail: publicProcedure
    .input(z.object({ token: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const now = new Date();
      const [row] = await ctx.db
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
          .set({ emailVerifiedAt: now })
          .where(eq(schema.users.id, row.userId));
      });
      return { verified: true };
    }),

  login: publicProcedure
    .input(z.object({ email: emailSchema, password: z.string() }))
    .mutation(async ({ ctx, input }) => {
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

  requestPasswordReset: publicProcedure
    .input(z.object({ email: emailSchema }))
    .mutation(async ({ ctx, input }) => {
      const [user] = await ctx.db
        .select()
        .from(schema.users)
        .where(sql`lower(${schema.users.email}) = ${input.email}`);
      if (user) {
        const token = await issueAuthToken(
          ctx.db,
          user.id,
          "password_reset",
          PASSWORD_RESET_TTL_MS,
        );
        await ctx.mailer.send({
          to: input.email,
          subject: "Reimposta la password",
          body: `Reimposta la password con questo token: ${token}`,
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
