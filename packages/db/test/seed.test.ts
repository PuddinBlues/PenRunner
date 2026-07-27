import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  categories,
  patternManeuvers,
  patterns,
} from "../src/schema/index.js";
import { seedCatalog } from "../src/seed/index.js";
import { setupTestDb } from "./helpers.js";

let ctx: Awaited<ReturnType<typeof setupTestDb>>;

beforeAll(async () => {
  ctx = await setupTestDb();
});

afterAll(async () => {
  await ctx.pool.end();
});

async function counts() {
  return {
    patterns: (await ctx.db.select().from(patterns)).length,
    maneuvers: (await ctx.db.select().from(patternManeuvers)).length,
    categories: (await ctx.db.select().from(categories)).length,
  };
}

describe("seed del catalogo di dominio", () => {
  it("carica i 20 pattern, 152 manovre e le 24 categorie della stagione 2026", async () => {
    expect(await counts()).toEqual({
      patterns: 20,
      maneuvers: 152,
      categories: 24,
    });
    const seasons = await ctx.db
      .selectDistinct({ season: patterns.season })
      .from(patterns);
    expect(seasons).toEqual([{ season: 2026 }]);
  });

  it("è idempotente: un secondo seed non duplica né aggiunge righe", async () => {
    const before = await counts();
    await seedCatalog(ctx.db);
    expect(await counts()).toEqual(before);
  });

  it("Pattern 1 ha 8 manovre", async () => {
    const [p1] = await ctx.db
      .select()
      .from(patterns)
      .where(eq(patterns.code, "1"));
    expect(p1).toBeDefined();
    const m = await ctx.db
      .select()
      .from(patternManeuvers)
      .where(eq(patternManeuvers.patternId, p1!.id));
    expect(m).toHaveLength(8);
  });

  // Canarino sulla fedeltà del seed: la sequenza del Pattern 6 è stata
  // verificata su una score card reale (colonne RS, LS, LC, RC, RRB, LRB, SB).
  it("Pattern 6: i 7 passi corrispondono a RS, LS, LC, RC, RRB, LRB, SB", async () => {
    const [p6] = await ctx.db
      .select()
      .from(patterns)
      .where(eq(patterns.code, "6"));
    expect(p6).toBeDefined();
    const m = await ctx.db
      .select()
      .from(patternManeuvers)
      .where(eq(patternManeuvers.patternId, p6!.id))
      .orderBy(asc(patternManeuvers.position));
    expect(m).toHaveLength(7);

    // colonna della card → tipi attesi + direzione nel testo italiano
    const expected: Array<{
      card: string;
      types: string[];
      direction?: RegExp;
    }> = [
      { card: "RS", types: ["spin"], direction: /destra/ },
      { card: "LS", types: ["spin"], direction: /sinistra/ },
      { card: "LC", types: ["circles", "lead_change"], direction: /sinistra/ },
      { card: "RC", types: ["circles", "lead_change"], direction: /destra/ },
      { card: "RRB", types: ["rollback"], direction: /rollback a destra/ },
      { card: "LRB", types: ["rollback"], direction: /rollback a sinistra/ },
      { card: "SB", types: ["stop", "backup"] },
    ];

    expected.forEach((exp, i) => {
      const step = m[i]!;
      expect(step.position, `${exp.card}: posizione`).toBe(i + 1);
      for (const t of exp.types) {
        expect(step.types, `${exp.card}: tipo ${t}`).toContain(t);
      }
      if (exp.direction) {
        expect(step.labelIt, `${exp.card}: direzione`).toMatch(exp.direction);
      }
    });
  });

  it("solo A e B sono ristretti (Youth 10&Under / Short Stirrup)", async () => {
    const all = await ctx.db.select().from(patterns);
    const restricted = all.filter((p) => p.restrictedTo !== null);
    expect(restricted.map((p) => p.code).sort()).toEqual(["A", "B"]);
    for (const p of restricted) {
      expect(p.restrictedTo).toEqual(["Youth 10&Under", "Short Stirrup"]);
    }
  });

  it("spot check categorie: Green Level (70) e Green Reiner 2 (111)", async () => {
    const [green] = await ctx.db
      .select()
      .from(categories)
      .where(eq(categories.code, "70"));
    expect(green).toMatchObject({
      name: "Green Level",
      championship: "debuttanti",
      tecnicoFederaleRequired: true,
      horseOwnership: "non_di_proprieta",
    });

    const [gr2] = await ctx.db
      .select()
      .from(categories)
      .where(eq(categories.code, "111"));
    expect(gr2?.earningsCap).toMatchObject({
      amount: 350,
      currency: "EUR",
      scope: "carriera",
      ref: "IRHA",
    });
  });

  it("i campionati coprono i 4 gruppi ufficiali", async () => {
    const rows = await ctx.db
      .selectDistinct({ championship: categories.championship })
      .from(categories);
    expect(rows.map((r) => r.championship).sort()).toEqual([
      "assoluto",
      "debuttanti",
      "facoltative",
      "italiano",
    ]);
  });
});
