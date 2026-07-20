import { openDB, type IDBPDatabase } from "idb";
import type { StorageAdapter } from "@penrunner/core";

// ---------------------------------------------------------------------------
// StorageAdapter (dall'interfaccia già astratta in @penrunner/core) su
// IndexedDB. Lo ScribeStore serializza tutto lo stato in un blob a ogni
// mutazione (write-ahead): un singolo record per la sessione di scoring.
// Il bundle (dati di riferimento read-only) vive in un record separato.
// ---------------------------------------------------------------------------

const DB_NAME = "penrunner-scribe";
const STORE = "kv";

// Una sola connessione riusata: aprire IndexedDB a ogni chiamata lascia
// connessioni pendenti (e blocca il resto).
let dbPromise: Promise<IDBPDatabase> | null = null;
function db(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(d) {
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
      },
    });
  }
  return dbPromise;
}

/** Adapter per lo ScribeStore, legato a una chiave (per-classe/giudice). */
export function indexedDbAdapter(key: string): StorageAdapter {
  return {
    async load() {
      return (await (await db()).get(STORE, key)) ?? null;
    },
    async save(snapshot: string) {
      await (await db()).put(STORE, snapshot, key);
    },
  };
}

export async function kvGet<T>(key: string): Promise<T | null> {
  return (await (await db()).get(STORE, key)) ?? null;
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  await (await db()).put(STORE, value, key);
}

/**
 * BR-81: chiede storage durevole per non farsi sfrattare i dati offline.
 * Best-effort — su iOS Safari non è garantito (collaudo su device reale).
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (navigator.storage?.persist) {
    try {
      return await navigator.storage.persist();
    } catch {
      return false;
    }
  }
  return false;
}
