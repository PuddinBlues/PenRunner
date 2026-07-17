import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index.js";

export const DEFAULT_DATABASE_URL =
  "postgres://penrunner:penrunner@localhost:5432/penrunner";

export function createDb(connectionString?: string) {
  const pool = new pg.Pool({
    connectionString:
      connectionString ?? process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
  });
  const db = drizzle(pool, { schema });
  return { db, pool };
}

export type Db = ReturnType<typeof createDb>["db"];
