import { sql } from "drizzle-orm";
import { schema } from "@penrunner/db";

// ---------------------------------------------------------------------------
// BR-84 — nome strutturato, resa DERIVATA in un solo posto. UI conversazionale
// = "Nome Cognome"; documenti ufficiali = "Cognome Nome" (convenzione FISE);
// ordinamenti alfabetici per (cognome, nome). Mai concatenare nomi a mano
// fuori da qui: è la guardia contro i formati divergenti.
// ---------------------------------------------------------------------------

export interface PersonName {
  firstName: string;
  lastName: string;
}

/** Resa conversazionale: "Nome Cognome" (nome vuoto solo da backfill in revisione). */
export function displayName(p: PersonName): string {
  return [p.firstName, p.lastName].filter(Boolean).join(" ");
}

/** Resa documenti ufficiali: "Cognome Nome". */
export function officialName(p: PersonName): string {
  return [p.lastName, p.firstName].filter(Boolean).join(" ");
}

/** Chiave di ordinamento alfabetico (cognome, nome), case-insensitive. */
export function nameSortKey(p: PersonName): string {
  return `${p.lastName} ${p.firstName}`.toLowerCase();
}

/** La stessa resa conversazionale come espressione SQL, per le select. */
export const personDisplayNameSql = sql<string>`btrim(${schema.persons.firstName} || ' ' || ${schema.persons.lastName})`;

/** Resa ufficiale ("Cognome Nome") come espressione SQL, per i documenti. */
export const personOfficialNameSql = sql<string>`btrim(${schema.persons.lastName} || ' ' || ${schema.persons.firstName})`;
