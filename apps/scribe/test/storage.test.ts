import { ScribeStore } from "@penrunner/core";
import { describe, expect, it } from "vitest";
import { indexedDbAdapter, kvGet, kvSet } from "../src/lib/storage.js";

// L'adapter IndexedDB dietro l'interfaccia già astratta: round-trip e — la
// cosa che conta in arena — sopravvivenza alla "riapertura" (recovery).
// Chiavi uniche per test (niente deleteDatabase: bloccherebbe la connessione).

describe("IndexedDB adapter", () => {
  it("round-trip di un valore", async () => {
    await kvSet("k-rt", { a: 1 });
    expect(await kvGet("k-rt")).toEqual({ a: 1 });
  });

  it("lo ScribeStore persiste e sopravvive alla riapertura (crash recovery)", async () => {
    const idGen = () => crypto.randomUUID();
    const clock = () => new Date().toISOString();
    const a = await ScribeStore.open(indexedDbAdapter("s1"), idGen, clock);
    const cardId = await a.createCard("run-1", "judge-1", 3);
    for (const p of [1, 2, 3]) await a.setQuality(cardId, p, 0.5);
    await a.closeCard(cardId);
    expect(a.queuedCounts.cards).toBe(1);

    // "riavvio del tablet": nuovo store dallo stesso storage
    const b = await ScribeStore.open(indexedDbAdapter("s1"), idGen, clock);
    expect(b.card(cardId).status).toBe("chiusa");
    expect(b.queuedCounts.cards).toBe(1); // la coda è intatta
    const total = b.card(cardId).displayedTotal;
    expect(total).toBe(71.5); // 70 + 1.5, mostrato alla chiusura
  });

  it("store separati per giudice non si mescolano", async () => {
    const idGen = () => crypto.randomUUID();
    const clock = () => new Date().toISOString();
    const a = await ScribeStore.open(indexedDbAdapter("store:e:jA"), idGen, clock);
    const b = await ScribeStore.open(indexedDbAdapter("store:e:jB"), idGen, clock);
    await a.createCard("run-1", "jA", 3);
    expect(a.cardForRun("run-1", "jA")).toBeDefined();
    expect(b.cardForRun("run-1", "jB")).toBeUndefined();
  });
});
