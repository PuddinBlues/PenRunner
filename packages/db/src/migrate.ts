import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb } from "./client.js";

export async function runMigrations(connectionString?: string) {
  const { db, pool } = createDb(connectionString);
  try {
    await migrate(db, {
      migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
    });
  } finally {
    await pool.end();
  }
}

const invokedDirectly =
  process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (invokedDirectly) {
  runMigrations()
    .then(() => {
      console.log("Migrazioni applicate.");
    })
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    });
}
