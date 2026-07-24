import { prepareClosure, type ClosureDisplay } from "./signature.js";
import type { ManeuverScoreInput, SpecialOutcome } from "./scoring.js";
import { SCORING_ENGINE_VERSION } from "./version.js";

// ---------------------------------------------------------------------------
// Nucleo offline dell'app scribe (senza UI, senza framework). Regole:
// - WRITE-AHEAD: ogni mutazione è persistita PRIMA di essere confermata;
//   la coda delle carte chiuse/firmate sopravvive a crash e riavvio.
// - Solo le carte CHIUSE lasciano il device (BR-27); le bozze mai.
// - Dalla firma la carta è immutabile ANCHE in locale (BR-40).
// - held for review (BR-29) è un evento di run: la carta resta aperta.
// Lo storage è un adapter (in-memory nei test, IndexedDB nella UI).
// ---------------------------------------------------------------------------

export interface StorageAdapter {
  load(): Promise<string | null>;
  save(snapshot: string): Promise<void>;
}

export type LocalCardStatus = "in_compilazione" | "chiusa" | "firmata";

export interface LocalCard {
  clientCardId: string;
  runId: string;
  judgeId: string;
  maneuvers: ManeuverScoreInput[];
  runPenalty: number;
  special: SpecialOutcome | null;
  status: LocalCardStatus;
  closedAt: string | null;
  /** il totale MOSTRATO alla chiusura (echeggiato alla sync, mai "salvato" come verità) */
  displayedTotal: number | null;
  signedAt: string | null;
  signatureStroke: string | null;
}

export type RunEventType = "sent_to_field" | "held_for_review" | "reopened";

export interface LocalRunEvent {
  clientEventId: string;
  runId: string;
  type: RunEventType;
  at: string;
  note?: string;
  /** held_for_review: la MANOVRA del dubbio (BR-29, suggerimento del giudice) */
  position?: number;
}

interface StoreState {
  engineVersion: string;
  cards: Record<string, LocalCard>; // per clientCardId
  events: LocalRunEvent[];
  /** clientCardId / clientEventId in attesa di ack dal server */
  outbox: { cards: string[]; events: string[] };
}

export interface SyncCardPayload {
  clientCardId: string;
  runId: string;
  judgeId: string;
  maneuvers: ManeuverScoreInput[];
  runPenalty: number;
  special: SpecialOutcome | null;
  status: "chiusa" | "firmata";
  closedAt: string;
  displayedTotal: number | null;
  engineVersion: string;
  signedAt: string | null;
  signatureStroke: string | null;
}

export interface SyncPayload {
  engineVersion: string;
  cards: SyncCardPayload[];
  events: LocalRunEvent[];
}

export class ScribeStoreError extends Error {}

export class ScribeStore {
  private state: StoreState = {
    engineVersion: SCORING_ENGINE_VERSION,
    cards: {},
    events: [],
    outbox: { cards: [], events: [] },
  };

  constructor(
    private readonly storage: StorageAdapter,
    private readonly idGen: () => string,
    private readonly clock: () => string,
  ) {}

  static async open(
    storage: StorageAdapter,
    idGen: () => string,
    clock: () => string,
  ): Promise<ScribeStore> {
    const store = new ScribeStore(storage, idGen, clock);
    const snapshot = await storage.load();
    if (snapshot) store.state = JSON.parse(snapshot) as StoreState;
    return store;
  }

  /** Write-ahead: persiste il nuovo stato, poi lo rende effettivo. */
  private async commit(next: StoreState): Promise<void> {
    await this.storage.save(JSON.stringify(next));
    this.state = next;
  }

  private next(): StoreState {
    return structuredClone(this.state);
  }

  card(clientCardId: string): LocalCard {
    const card = this.state.cards[clientCardId];
    if (!card) throw new ScribeStoreError("Carta inesistente");
    return card;
  }

  cardForRun(runId: string, judgeId: string): LocalCard | undefined {
    return Object.values(this.state.cards).find(
      (c) => c.runId === runId && c.judgeId === judgeId,
    );
  }

  /** Le run trattenute in review da QUESTO device (BR-29): per lo stato
   *  del blocco di firma la RunList deve dire PERCHÉ manca una carta. */
  heldRunIds(): Set<string> {
    return new Set(
      this.state.events
        .filter((e) => e.type === "held_for_review")
        .map((e) => e.runId),
    );
  }

  get queuedCounts(): { cards: number; events: number } {
    return {
      cards: this.state.outbox.cards.length,
      events: this.state.outbox.events.length,
    };
  }

  private mutableCard(next: StoreState, clientCardId: string): LocalCard {
    const card = next.cards[clientCardId];
    if (!card) throw new ScribeStoreError("Carta inesistente");
    if (card.status === "firmata") {
      throw new ScribeStoreError("Carta firmata: immutabile (BR-40)");
    }
    if (card.status === "chiusa") {
      throw new ScribeStoreError(
        "Carta chiusa: riaprila prima di modificarla (BR-27)",
      );
    }
    return card;
  }

  async createCard(
    runId: string,
    judgeId: string,
    maneuverCount: number,
  ): Promise<string> {
    if (this.cardForRun(runId, judgeId)) {
      throw new ScribeStoreError("Esiste già una carta per questa run e giudice");
    }
    const next = this.next();
    const clientCardId = this.idGen();
    next.cards[clientCardId] = {
      clientCardId,
      runId,
      judgeId,
      maneuvers: Array.from({ length: maneuverCount }, (_, i) => ({
        position: i + 1,
        quality: null,
        penalty: 0,
      })),
      runPenalty: 0,
      special: null,
      status: "in_compilazione",
      closedAt: null,
      displayedTotal: null,
      signedAt: null,
      signatureStroke: null,
    };
    await this.commit(next);
    return clientCardId;
  }

  async setQuality(clientCardId: string, position: number, quality: number | null) {
    const next = this.next();
    const card = this.mutableCard(next, clientCardId);
    const m = card.maneuvers.find((x) => x.position === position);
    if (!m) throw new ScribeStoreError(`Manovra ${position} inesistente`);
    m.quality = quality;
    await this.commit(next);
  }

  async setPenalty(clientCardId: string, position: number, penalty: number) {
    const next = this.next();
    const card = this.mutableCard(next, clientCardId);
    const m = card.maneuvers.find((x) => x.position === position);
    if (!m) throw new ScribeStoreError(`Manovra ${position} inesistente`);
    m.penalty = penalty;
    await this.commit(next);
  }

  async setRunPenalty(clientCardId: string, runPenalty: number) {
    const next = this.next();
    this.mutableCard(next, clientCardId).runPenalty = runPenalty;
    await this.commit(next);
  }

  async setSpecial(clientCardId: string, special: SpecialOutcome | null) {
    const next = this.next();
    this.mutableCard(next, clientCardId).special = special;
    await this.commit(next);
  }

  /** "Manda in campo": evento di run, con timestamp (àncora ETA). */
  async sendToField(runId: string) {
    await this.pushEvent({ runId, type: "sent_to_field" });
  }

  /**
   * BR-29: il giudice trattiene lo score. La carta resta APERTA (né chiusa
   * né firmata): verso il mondo viaggia solo l'evento di run. `position` =
   * la manovra del dubbio: al drag il confronto parte già informato.
   */
  async holdForReview(runId: string, note: string, position?: number) {
    await this.pushEvent({
      runId,
      type: "held_for_review",
      note,
      ...(position !== undefined ? { position } : {}),
    });
  }

  private async pushEvent(e: {
    runId: string;
    type: RunEventType;
    note?: string;
    position?: number;
  }) {
    const next = this.next();
    const event: LocalRunEvent = {
      clientEventId: this.idGen(),
      runId: e.runId,
      type: e.type,
      at: this.clock(),
      ...(e.note !== undefined ? { note: e.note } : {}),
      ...(e.position !== undefined ? { position: e.position } : {}),
    };
    next.events.push(event);
    next.outbox.events.push(event.clientEventId);
    await this.commit(next);
  }

  /**
   * Chiusura (BR-27): valida la completezza col motore e MOSTRA il totale —
   * è l'annuncio. La carta entra in coda di sync come punteggio provvisorio.
   * held NON esonera dalla completezza: si chiude con UN valore deciso.
   */
  async closeCard(clientCardId: string): Promise<ClosureDisplay> {
    const next = this.next();
    const card = this.mutableCard(next, clientCardId);
    const display = prepareClosure(
      {
        maneuvers: card.maneuvers,
        runPenalty: card.runPenalty,
        special: card.special,
      },
      card.maneuvers.length,
    );
    card.status = "chiusa";
    card.closedAt = this.clock();
    card.displayedTotal = display.breakdown.total;
    if (!next.outbox.cards.includes(clientCardId)) {
      next.outbox.cards.push(clientCardId);
    }
    await this.commit(next);
    return display;
  }

  /**
   * Riapertura PRE-firma (BR-27): stessa clientCardId, evento di run
   * tracciato; la richiusura ri-sincronizza come update della stessa carta.
   */
  async reopenCard(clientCardId: string) {
    const next = this.next();
    const card = next.cards[clientCardId];
    if (!card) throw new ScribeStoreError("Carta inesistente");
    if (card.status === "firmata") {
      throw new ScribeStoreError("Carta firmata: immutabile (BR-40)");
    }
    if (card.status !== "chiusa") {
      throw new ScribeStoreError("Solo una carta chiusa si può riaprire");
    }
    card.status = "in_compilazione";
    card.closedAt = null;
    card.displayedTotal = null;
    const event: LocalRunEvent = {
      clientEventId: this.idGen(),
      runId: card.runId,
      type: "reopened",
      at: this.clock(),
      note: clientCardId,
    };
    next.events.push(event);
    next.outbox.events.push(event.clientEventId);
    await this.commit(next);
  }

  /**
   * Firma in batch (BR-27): il giudice rivede l'elenco con ogni totale
   * visibile e firma — signed_at e tratto per carta. Da qui: immutabili.
   */
  async signBatch(
    items: Array<{ clientCardId: string; signatureStroke?: string }>,
  ) {
    const next = this.next();
    for (const item of items) {
      const card = next.cards[item.clientCardId];
      if (!card) throw new ScribeStoreError("Carta inesistente");
      if (card.status !== "chiusa") {
        throw new ScribeStoreError(
          "Si firmano solo carte chiuse (BR-27): nessuna firma su bozze",
        );
      }
    }
    for (const item of items) {
      const card = next.cards[item.clientCardId]!;
      card.status = "firmata";
      card.signedAt = this.clock();
      card.signatureStroke = item.signatureStroke ?? null;
      if (!next.outbox.cards.includes(card.clientCardId)) {
        next.outbox.cards.push(card.clientCardId);
      }
    }
    await this.commit(next);
  }

  /** Il payload per scoring.sync: solo carte chiuse/firmate, mai bozze. */
  buildSyncPayload(): SyncPayload {
    const cards = this.state.outbox.cards
      .map((id) => this.state.cards[id]!)
      .filter((c) => c.status !== "in_compilazione")
      .map((c) => ({
        clientCardId: c.clientCardId,
        runId: c.runId,
        judgeId: c.judgeId,
        maneuvers: c.maneuvers,
        runPenalty: c.runPenalty,
        special: c.special,
        status: c.status as "chiusa" | "firmata",
        closedAt: c.closedAt!,
        displayedTotal: c.displayedTotal,
        engineVersion: this.state.engineVersion,
        signedAt: c.signedAt,
        signatureStroke: c.signatureStroke,
      }));
    const events = this.state.events.filter((e) =>
      this.state.outbox.events.includes(e.clientEventId),
    );
    return { engineVersion: this.state.engineVersion, cards, events };
  }

  /** Ack del server: rimuove dalla coda ciò che è stato applicato. */
  async markSynced(acked: { cards?: string[]; events?: string[] }) {
    const next = this.next();
    next.outbox.cards = next.outbox.cards.filter(
      (id) => !(acked.cards ?? []).includes(id),
    );
    next.outbox.events = next.outbox.events.filter(
      (id) => !(acked.events ?? []).includes(id),
    );
    await this.commit(next);
  }
}
