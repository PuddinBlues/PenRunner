import { sql } from "drizzle-orm";
import { expect } from "vitest";
import { createDb } from "../src/client.js";
import { runMigrations } from "../src/migrate.js";
import { seedCatalog } from "../src/seed/index.js";

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://penrunner:penrunner@localhost:5432/penrunner_test";

export async function setupTestDb() {
  await runMigrations(TEST_DATABASE_URL);
  const { db, pool } = createDb(TEST_DATABASE_URL);
  await seedCatalog(db);
  return { db, pool };
}

/**
 * Verifica che una query violi il vincolo atteso. Drizzle incapsula l'errore
 * del driver: il nome del constraint va cercato nella catena delle cause.
 */
export async function expectConstraintViolation(
  promise: Promise<unknown>,
  constraintName: string,
) {
  const err = await promise.then(
    () => {
      throw new Error(
        `la query doveva violare il vincolo ${constraintName}, invece è passata`,
      );
    },
    (e: unknown) => e,
  );
  const chain: string[] = [];
  for (let e = err; e instanceof Error; e = e.cause as Error) {
    chain.push(e.message);
    if ("constraint" in e) chain.push(String(e.constraint));
  }
  expect(chain.join("\n")).toContain(constraintName);
}

/** Svuota le tabelle operative lasciando intatto il catalogo seedato. */
export async function truncateOperationalTables(
  db: Awaited<ReturnType<typeof setupTestDb>>["db"],
) {
  await db.execute(
    sql`truncate events, stables, persons, horses, organizations, users, audit_log restart identity cascade`,
  );
}
