// ---------------------------------------------------------------------------
// La matrice ruoli/permessi della spec come funzione pura: can(actor,
// capability, resource). I ruoli non sono un enum sull'utente:
// - le capacità organizzative discendono dalla membership (organization_members);
// - scuderia dall'essere referente della stable;
// - giudice/scribe/segreteria-evento dalla sessione di invito event-scoped;
// - rider/owner sono fatti dei dati: le capacità "concorrente" valgono per
//   qualsiasi utente verificato sui propri dati.
// Il Platform Admin (BR-70) è fuori dalla matrice pubblica: ha solo le
// capacità admin.*, nessun bypass su quelle di gara.
// ---------------------------------------------------------------------------

export const CAPABILITIES = [
  // matrice pubblica
  "event.configure", // crea e configura evento (classi, fee, montepremi, ruoli)
  "event.registry.manage", // anagrafiche dell'evento (segreteria: delegata ◐)
  "event.checkin", // verifica microchip/tessera
  "event.draw.manage", // genera/modifica il draw (segreteria: delegata ◐)
  "score.insert", // inserisce i punteggi (scribe ✓, giudice ◐ in proprio)
  "scorecard.sign", // firma la ScoreCard (solo giudice)
  "score.backfill", // BR-28: inserisce a posteriori la carta cartacea
  "results.validate", // valida e pubblica i risultati
  "score.correct", // corregge uno score pubblicato (con audit)
  "entries.bulk", // iscrizione massiva (scuderia)
  "entries.own", // iscrizione individuale (sui propri dati)
  "roster.manage", // roster scuderia ✓ / propri cavalli ◐
  "results.own.view", // risultati propri / della propria scuderia
  "public.view", // calendario e risultati pubblici
  "payout.manage", // payout e rendicontazione fee
  // fuori matrice (BR-70)
  "admin.vetting",
  "admin.users.suspend",
  "admin.audit.view",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

export type OrgMembership = {
  organizationId: string;
  role: "titolare" | "segreteria";
  vetted: boolean;
};

export type Actor =
  | { kind: "anonymous" }
  | {
      kind: "user";
      userId: string;
      personId: string | null;
      emailVerified: boolean;
      suspended: boolean;
      platformAdmin: boolean;
      organizations: OrgMembership[];
      referentOfStableIds: string[];
    }
  | {
      kind: "invite";
      personId: string;
      eventId: string;
      role: "giudice" | "scribe" | "segreteria";
      /** null = tutto l'evento; altrimenti le classi assegnate */
      classIds: string[] | null;
    };

/** Il contesto della risorsa su cui si vuole agire. */
export interface ResourceCtx {
  /** organizzazione proprietaria dell'evento/risorsa */
  organizationId?: string;
  eventId?: string;
  classId?: string;
  stableId?: string;
  /** person proprietaria della risorsa (per le capacità "own") */
  personId?: string;
}

const ADMIN_CAPABILITIES: ReadonlySet<Capability> = new Set([
  "admin.vetting",
  "admin.users.suspend",
  "admin.audit.view",
]);

// Capacità della colonna Organizzatore (✓ piene).
const ORGANIZER_CAPABILITIES: ReadonlySet<Capability> = new Set([
  "event.configure",
  "event.registry.manage",
  "event.checkin",
  "event.draw.manage",
  "results.validate",
  "score.correct",
  "score.backfill",
  "payout.manage",
  "results.own.view",
]);

// Sottoinsieme delegato alla segreteria (✓ o ◐ nella colonna Segreteria).
const SEGRETERIA_CAPABILITIES: ReadonlySet<Capability> = new Set([
  "event.registry.manage",
  "event.checkin",
  "event.draw.manage",
  "score.backfill", // BR-28: il backfill è di organizzatore e segreteria
]);

function orgMembership(
  actor: Extract<Actor, { kind: "user" }>,
  organizationId: string | undefined,
): OrgMembership | undefined {
  if (!organizationId) return undefined;
  return actor.organizations.find((m) => m.organizationId === organizationId);
}

export function can(
  actor: Actor,
  capability: Capability,
  resource: ResourceCtx = {},
): boolean {
  if (capability === "public.view") return true;

  if (actor.kind === "anonymous") return false;

  // Sessione di invito event-scoped: solo le capacità del ruolo, solo
  // sull'evento (ed eventualmente sulle classi) dell'assegnazione.
  if (actor.kind === "invite") {
    if (!resource.eventId || resource.eventId !== actor.eventId) return false;
    if (
      actor.classIds !== null &&
      resource.classId !== undefined &&
      !actor.classIds.includes(resource.classId)
    ) {
      return false;
    }
    switch (actor.role) {
      case "giudice":
        // ◐ inserisce in proprio, ✓ firma
        return capability === "score.insert" || capability === "scorecard.sign";
      case "scribe":
        return capability === "score.insert";
      case "segreteria":
        return SEGRETERIA_CAPABILITIES.has(capability);
    }
  }

  // Utente sospeso: resta solo la vista pubblica (già gestita sopra).
  if (actor.suspended) return false;

  // BR-70: capacità admin solo per lo staff; e lo staff non eredita da qui
  // nessuna capacità di gara (le correzioni passano dai flussi BR-40/41).
  if (ADMIN_CAPABILITIES.has(capability)) return actor.platformAdmin;

  const membership = orgMembership(actor, resource.organizationId);

  if (ORGANIZER_CAPABILITIES.has(capability) && membership?.vetted) {
    if (membership.role === "titolare") return true;
    if (membership.role === "segreteria") {
      return SEGRETERIA_CAPABILITIES.has(capability);
    }
  }

  // Capacità che richiedono un'anagrafica collegata ed email verificata.
  if (!actor.personId || !actor.emailVerified) return false;

  switch (capability) {
    case "entries.bulk":
      return (
        resource.stableId !== undefined &&
        actor.referentOfStableIds.includes(resource.stableId)
      );
    case "roster.manage":
      // ✓ scuderia (referente), ◐ concorrente sui propri cavalli
      if (
        resource.stableId !== undefined &&
        actor.referentOfStableIds.includes(resource.stableId)
      ) {
        return true;
      }
      return resource.personId === actor.personId;
    case "entries.own":
      return (
        resource.personId === undefined || resource.personId === actor.personId
      );
    case "results.own.view":
      if (resource.personId === actor.personId) return true;
      return (
        resource.stableId !== undefined &&
        actor.referentOfStableIds.includes(resource.stableId)
      );
    default:
      return false;
  }
}
