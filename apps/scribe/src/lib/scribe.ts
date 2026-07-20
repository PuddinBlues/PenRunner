import {
  ScribeStore,
  computeCardScore,
  type CardBreakdown,
  type LocalCard,
} from "@penrunner/core";
import { makeClient } from "./api.js";
import { indexedDbAdapter, kvGet, kvSet } from "./storage.js";
import type { ScoringBundle, Session } from "./types.js";

// ---------------------------------------------------------------------------
// Il "motore locale" dell'app: monta lo ScribeStore (già testato allo step 5)
// su IndexedDB, tiene il bundle offline, e sincronizza quando c'è rete. Non
// reimplementa NULLA della logica di scoring — collega solo store e sync.
// ---------------------------------------------------------------------------

const SESSION_KEY = "session";
const BUNDLE_KEY = (eventId: string) => `bundle:${eventId}`;
const STORE_KEY = (eventId: string, judgeId: string) => `store:${eventId}:${judgeId}`;

export interface ScribeContext {
  session: Session;
  bundle: ScoringBundle;
  store: ScribeStore;
  judgePersonId: string;
}

export async function loadSession(): Promise<Session | null> {
  return kvGet<Session>(SESSION_KEY);
}
export async function saveSession(s: Session): Promise<void> {
  await kvSet(SESSION_KEY, s);
}
export async function clearSession(): Promise<void> {
  await kvSet(SESSION_KEY, null);
}

/** Accetta il magic link, apre la sessione scoped e scarica il bundle. */
export async function acceptInvite(token: string): Promise<Session> {
  const client = makeClient(null);
  const res = await client.invite.accept.mutate({ token });
  const session: Session = {
    token: res.sessionToken,
    eventId: res.eventId,
    role: res.role as "giudice" | "scribe",
  };
  await saveSession(session);
  return session;
}

/** Scarica (o rinfresca) il bundle quando c'è rete; se offline usa la copia. */
export async function loadBundle(session: Session): Promise<ScoringBundle | null> {
  const cached = await kvGet<ScoringBundle>(BUNDLE_KEY(session.eventId));
  try {
    const client = makeClient(session.token);
    const fresh = (await client.scoring.bundle.query({
      eventId: session.eventId,
    })) as unknown as ScoringBundle;
    await kvSet(BUNDLE_KEY(session.eventId), fresh);
    return fresh;
  } catch {
    return cached; // offline: si lavora con l'ultima copia scaricata
  }
}

export async function openStore(
  eventId: string,
  judgePersonId: string,
): Promise<ScribeStore> {
  return ScribeStore.open(
    indexedDbAdapter(STORE_KEY(eventId, judgePersonId)),
    () => crypto.randomUUID(),
    () => new Date().toISOString(),
  );
}

export function breakdownOf(card: LocalCard): CardBreakdown {
  return computeCardScore({
    maneuvers: card.maneuvers,
    runPenalty: card.runPenalty,
    special: card.special,
  });
}

/** Sync della coda quando c'è rete: idempotente per costruzione lato server. */
export async function syncNow(
  session: Session,
  store: ScribeStore,
): Promise<{ synced: boolean }> {
  const payload = store.buildSyncPayload();
  if (payload.cards.length === 0 && payload.events.length === 0) {
    return { synced: true };
  }
  const client = makeClient(session.token);
  const res = await client.scoring.sync.mutate(payload);
  // rimuove dalla coda ciò che è stato accettato (applied/duplicate);
  // conflict/mismatch restano visibili all'organizzatore, non riproviamo a ciclo.
  const okCards = res.cards
    .filter((c) => ["applied", "duplicate"].includes(c.result))
    .map((c) => c.clientCardId);
  const okEvents = res.events
    .filter((e) => ["applied", "duplicate"].includes(e.result))
    .map((e) => e.clientEventId);
  await store.markSynced({ cards: okCards, events: okEvents });
  return { synced: true };
}

/**
 * Segnale "classe già in scoring altrove" (avviso, mai blocco — show must go
 * on). Euristica su dati reali del bundle: se una run della classe è già
 * avanzata (oltre 'attesa') ma questo store locale non ha una carta per quel
 * binomio, qualcun altro l'ha toccata → probabile secondo device. Sincronizza
 * segnali già confermati dal server, quindi cross-device e onesto.
 */
export function detectOtherDeviceActivity(
  bundle: ScoringBundle,
  store: ScribeStore,
  classId: string,
  judgePersonId: string,
): boolean {
  const entryIds = new Set(
    bundle.entries.filter((e) => e.classId === classId).map((e) => e.id),
  );
  const runs = bundle.runs.filter((r) => entryIds.has(r.entryId));
  return runs.some(
    (r) => r.status !== "attesa" && !store.cardForRun(r.id, judgePersonId),
  );
}
