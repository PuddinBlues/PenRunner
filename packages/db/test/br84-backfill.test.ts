import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTestDb } from "./helpers.js";

// ---------------------------------------------------------------------------
// Guardia BR-84: l'euristica di backfill (split al PRIMO spazio: nome = primo
// token, resto = cognome) testata con l'UPDATE REALE estratto dal file di
// migrazione 0012 — non una copia che può divergere. Gira su una tabella
// sosia in uno schema temporaneo: la migrazione vera è già passata sul DB
// di test e full_name non esiste più.
// ---------------------------------------------------------------------------

let ctx: Awaited<ReturnType<typeof setupTestDb>>;

const MIGRATION = readFileSync(
  join(__dirname, "..", "drizzle", "0012_careless_clea.sql"),
  "utf8",
);
const UPDATE_STMT = MIGRATION.split("--> statement-breakpoint")
  .map((s) => s.trim())
  .find((s) => s.replace(/^--.*$/gm, "").trim().startsWith("UPDATE"));

beforeAll(async () => {
  ctx = await setupTestDb();
});

afterAll(async () => {
  await ctx.pool.end();
});

describe("BR-84: backfill euristico della migrazione 0012", () => {
  it("l'UPDATE è presente nel file di migrazione", () => {
    expect(UPDATE_STMT).toBeTruthy();
  });

  it("split al primo spazio, particelle nel cognome, flag sui casi incerti", async () => {
    const { db } = ctx;
    // Una TRANSAZIONE = una connessione: SET LOCAL vale solo qui dentro e
    // il rollback finale non lascia traccia (schema incluso).
    const byName = await db.transaction(async (tx) => {
      await tx.execute(sql`create schema br84_test`);
      await tx.execute(sql`set local search_path to br84_test`);
      await tx.execute(
        sql.raw(
          `create table persons (full_name text not null, first_name text, last_name text, name_needs_review boolean default false not null)`,
        ),
      );
      await tx.execute(
        sql.raw(
          `insert into persons (full_name) values
           ('Marco Rossi'),
           ('Marco De Rossi'),
           ('Maria Grazia Bianchi'),
           ('Rossi'),
           ('  Anna   Verdi  ')`,
        ),
      );
      await tx.execute(sql.raw(UPDATE_STMT!));
      const { rows } = await tx.execute(
        sql.raw(
          `select full_name, first_name, last_name, name_needs_review from persons order by full_name`,
        ),
      );
      await tx.execute(sql`drop schema br84_test cascade`);
      return Object.fromEntries(
        rows.map((r) => [String(r.full_name).trim(), r]),
      );
    });
      // 2 token: split pulito, nessun flag
      expect(byName["Marco Rossi"]).toMatchObject({
        first_name: "Marco",
        last_name: "Rossi",
        name_needs_review: false,
      });
      // particella: resta nel cognome (la ragione della scelta primo-spazio)
      expect(byName["Marco De Rossi"]).toMatchObject({
        first_name: "Marco",
        last_name: "De Rossi",
        name_needs_review: true, // ≥3 token: comunque in revisione
      });
      // nome doppio: l'euristica sbaglia MA il flag lo fa emergere
      expect(byName["Maria Grazia Bianchi"]).toMatchObject({
        first_name: "Maria",
        last_name: "Grazia Bianchi",
        name_needs_review: true,
      });
      // token singolo: tutto nel cognome, nome vuoto ammesso solo qui
      expect(byName["Rossi"]).toMatchObject({
        first_name: "",
        last_name: "Rossi",
        name_needs_review: true,
      });
      // spazi multipli: btrim + split robusti
      expect(byName["Anna   Verdi"]).toMatchObject({
        first_name: "Anna",
        name_needs_review: false,
      });
  });
});
