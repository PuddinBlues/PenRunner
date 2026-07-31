import { sql } from "drizzle-orm";
import { expect } from "vitest";
import { createDb, type Db } from "@penrunner/db";
import { runMigrations } from "@penrunner/db/migrate";
import { seedCatalog } from "@penrunner/db/seed";
import { resolveActor, type AppContext } from "../src/context.js";
import { appRouter } from "../src/routers/index.js";
import { DevMailer, extractToken } from "../src/services/mailer.js";

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://penrunner:penrunner@localhost:5432/penrunner_test";

export interface TestApi {
  db: Db;
  mailer: DevMailer;
  /** Caller tRPC con la sessione data (o anonimo). */
  as(sessionToken?: string): Promise<ReturnType<typeof appRouter.createCaller>>;
  close(): Promise<void>;
}

export async function setupApi(): Promise<TestApi> {
  await runMigrations(TEST_DATABASE_URL);
  const { db, pool } = createDb(TEST_DATABASE_URL);
  await seedCatalog(db);
  // Pulisce tutto tranne il catalogo di dominio (l'audit_log non ha DELETE:
  // il trigger BR-71 lo blocca, ma TRUNCATE per il reset dei test passa).
  await db.execute(
    sql`truncate organizations, users, events, stables, persons, horses, audit_log restart identity cascade`,
  );
  const mailer = new DevMailer();
  return {
    db,
    mailer,
    async as(sessionToken?: string) {
      const { actor, sessionId } = await resolveActor(db, sessionToken);
      const ctx: AppContext = sessionId
        ? { db, mailer, actor, sessionId }
        : { db, mailer, actor };
      return appRouter.createCaller(ctx);
    },
    async close() {
      await pool.end();
    },
  };
}

/**
 * Data futura "YYYY-MM-DD" a N giorni da oggi. Gli eventi di test devono
 * restare SEMPRE nel futuro: con date fisse, al passare del calendario
 * scatterebbe il cut-off BR-90 e la suite diventerebbe rossa a orologeria.
 */
export function futureDate(daysFromNow: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

/**
 * Verifica che una query fallisca per il motivo atteso. Drizzle incapsula
 * l'errore del driver: il testo va cercato nella catena delle cause.
 */
export async function expectDbError(promise: Promise<unknown>, pattern: RegExp) {
  const err = await promise.then(
    () => {
      throw new Error(`la query doveva fallire con ${pattern}, invece è passata`);
    },
    (e: unknown) => e,
  );
  const chain: string[] = [];
  for (let e = err; e instanceof Error; e = e.cause as Error) {
    chain.push(e.message);
  }
  expect(chain.join("\n")).toMatch(pattern);
}

/** Registra, verifica l'email (token dal mailer dev) e apre una sessione. */
export async function registerVerifiedUser(
  api: TestApi,
  email: string,
  password = "password-di-test",
) {
  const anon = await api.as();
  const { userId } = await anon.auth.register({ email, password });
  const token = extractToken(api.mailer.lastTo(email)!);
  await anon.auth.verifyEmail({ token });
  const { sessionToken } = await anon.auth.login({ email, password });
  return { userId, sessionToken };
}

/** Utente completo di profilo (person creata o rivendicata). */
export async function registerUserWithProfile(
  api: TestApi,
  email: string,
  fullName: string,
) {
  const { userId, sessionToken } = await registerVerifiedUser(api, email);
  const caller = await api.as(sessionToken);
  const { claimable } = await caller.profile.claimStatus();
  const [first, ...rest] = fullName.split(" ");
  const { personId } = claimable
    ? await caller.profile.claimAccept()
    : await caller.profile.create({
        firstName: first!,
        lastName: rest.join(" ") || first!,
      });
  return { userId, personId, sessionToken };
}
