import { describe, expect, it } from "vitest";
import {
  ScribeStore,
  ScribeStoreError,
  type StorageAdapter,
} from "../src/index.js";

/** Adapter in-memory che simula lo storage durabile del device. */
class MemoryAdapter implements StorageAdapter {
  snapshot: string | null = null;
  failNextSave = false;
  async load() {
    return this.snapshot;
  }
  async save(s: string) {
    if (this.failNextSave) {
      this.failNextSave = false;
      throw new Error("disco pieno");
    }
    this.snapshot = s;
  }
}

function ids() {
  let n = 0;
  return () => `id-${++n}`;
}
function clock() {
  let t = 0;
  return () => new Date(1750000000000 + ++t * 1000).toISOString();
}

async function makeStore(adapter = new MemoryAdapter()) {
  const store = await ScribeStore.open(adapter, ids(), clock());
  return { store, adapter };
}

async function filledCard(store: ScribeStore, runId = "run-1") {
  const id = await store.createCard(runId, "judge-1", 3);
  for (const p of [1, 2, 3]) await store.setQuality(id, p, 0.5);
  await store.setPenalty(id, 2, 1);
  return id;
}

describe("store offline: write-ahead e recovery", () => {
  it("il tablet muore e riparte: carta in compilazione e coda sopravvivono", async () => {
    const adapter = new MemoryAdapter();
    const a = await ScribeStore.open(adapter, ids(), clock());
    const cardId = await filledCard(a);
    await a.closeCard(cardId);
    await a.sendToField("run-2");

    // "riavvio": nuovo store dallo stesso storage
    const b = await ScribeStore.open(adapter, ids(), clock());
    expect(b.card(cardId).status).toBe("chiusa");
    expect(b.queuedCounts).toEqual({ cards: 1, events: 1 }); // carta chiusa + sent_to_field
  });

  it("se la persistenza fallisce, la mutazione NON è confermata", async () => {
    const { store, adapter } = await makeStore();
    const cardId = await filledCard(store);
    adapter.failNextSave = true;
    await expect(store.setQuality(cardId, 1, 1.5)).rejects.toThrow(/disco pieno/);
    // lo stato in memoria non è avanzato oltre lo storage
    expect(store.card(cardId).maneuvers[0]!.quality).toBe(0.5);
  });
});

describe("chiusura ≠ firma (BR-27)", () => {
  it("la chiusura valida la completezza e mostra il totale", async () => {
    const { store } = await makeStore();
    const cardId = await store.createCard("run-1", "judge-1", 2);
    await store.setQuality(cardId, 1, 0.5);
    await expect(store.closeCard(cardId)).rejects.toThrow(/mancante/);
    await store.setQuality(cardId, 2, 0);
    const display = await store.closeCard(cardId);
    expect(display.breakdown.total).toBe(70.5);
    expect(store.queuedCounts.cards).toBe(1); // in coda come provvisorio
  });

  it("solo le carte chiuse entrano nel payload di sync, mai le bozze", async () => {
    const { store } = await makeStore();
    const chiusa = await filledCard(store, "run-1");
    await store.closeCard(chiusa);
    await store.createCard("run-2", "judge-1", 3); // bozza
    const payload = store.buildSyncPayload();
    expect(payload.cards).toHaveLength(1);
    expect(payload.cards[0]!.clientCardId).toBe(chiusa);
    expect(payload.cards[0]!.displayedTotal).toBe(70.5);
  });

  it("riapertura pre-firma: stessa clientCardId, evento tracciato, richiusura in coda", async () => {
    const { store } = await makeStore();
    const cardId = await filledCard(store);
    await store.closeCard(cardId);
    await store.markSynced({ cards: [cardId] }); // il server ha la chiusa

    await store.reopenCard(cardId);
    expect(store.card(cardId).status).toBe("in_compilazione");
    await store.setQuality(cardId, 1, 1); // correzione pre-firma: 0.5 → 1
    const display = await store.closeCard(cardId);
    expect(display.breakdown.total).toBe(71); // 70 + (1+0.5+0.5) − 1

    const payload = store.buildSyncPayload();
    // la richiusura ri-sincronizza la STESSA carta (update), più l'evento
    expect(payload.cards.map((c) => c.clientCardId)).toEqual([cardId]);
    expect(payload.events.some((e) => e.type === "reopened")).toBe(true);
  });

  it("una carta chiusa non si modifica senza riaprirla", async () => {
    const { store } = await makeStore();
    const cardId = await filledCard(store);
    await store.closeCard(cardId);
    await expect(store.setQuality(cardId, 1, 1)).rejects.toThrow(/riaprila/);
  });

  it("firma in batch: solo su chiuse, con tratto per carta; poi immutabili anche in locale", async () => {
    const { store } = await makeStore();
    const c1 = await filledCard(store, "run-1");
    const c2 = await filledCard(store, "run-2");
    await store.closeCard(c1);
    // c2 è bozza: la firma di batch con una bozza dentro è respinta in blocco
    await expect(
      store.signBatch([{ clientCardId: c1 }, { clientCardId: c2 }]),
    ).rejects.toThrow(/solo carte chiuse/);
    expect(store.card(c1).status).toBe("chiusa"); // atomico: nulla firmato

    await store.closeCard(c2);
    await store.signBatch([
      { clientCardId: c1, signatureStroke: "M0,0L10,10" },
      { clientCardId: c2 },
    ]);
    expect(store.card(c1)).toMatchObject({
      status: "firmata",
      signatureStroke: "M0,0L10,10",
    });
    expect(store.card(c1).signedAt).toBeTruthy();

    // immutabile in locale, PRIMA di ogni sync (BR-40)
    await expect(store.setQuality(c1, 1, 0)).rejects.toThrow(/immutabile/);
    await expect(store.reopenCard(c1)).rejects.toThrow(/immutabile/);
  });
});

describe("held for review (BR-29)", () => {
  it("è un evento di run: la carta resta aperta e NON in coda", async () => {
    const { store } = await makeStore();
    const cardId = await store.createCard("run-1", "judge-1", 3);
    await store.holdForReview("run-1", "Back: 4 o 5 passi → −2 oppure score 0");
    expect(store.card(cardId).status).toBe("in_compilazione");
    const payload = store.buildSyncPayload();
    expect(payload.cards).toHaveLength(0);
    const held = payload.events.find((e) => e.type === "held_for_review")!;
    expect(held.note).toMatch(/4 o 5 passi/);
  });

  it("held non esonera dalla completezza: si chiude con UN valore deciso", async () => {
    const { store } = await makeStore();
    const cardId = await store.createCard("run-1", "judge-1", 2);
    await store.holdForReview("run-1", "dubbio spin");
    await store.setQuality(cardId, 1, 0);
    await expect(store.closeCard(cardId)).rejects.toThrow(/mancante/);
    // risoluzione: si fissa il valore e si chiude (annuncio)
    await store.setQuality(cardId, 2, -0.5);
    await store.setPenalty(cardId, 2, 2);
    const d = await store.closeCard(cardId);
    expect(d.breakdown.total).toBe(67.5);
  });
});
