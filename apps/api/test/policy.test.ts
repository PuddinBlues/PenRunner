import { describe, expect, it } from "vitest";
import {
  can,
  type Actor,
  type Capability,
  type ResourceCtx,
} from "../src/policy/policy.js";

// ---------------------------------------------------------------------------
// La matrice ruoli/permessi della spec, riga per riga, come test tabellare.
// Ogni caso cita la cella: ✓ piena, ◐ delegata/parziale (ammessa con scope),
// — nessun accesso.
// ---------------------------------------------------------------------------

const ORG = "11111111-1111-1111-1111-111111111111";
const OTHER_ORG = "22222222-2222-2222-2222-222222222222";
const EVENT = "33333333-3333-3333-3333-333333333333";
const OTHER_EVENT = "44444444-4444-4444-4444-444444444444";
const CLASS = "55555555-5555-5555-5555-555555555555";
const OTHER_CLASS = "66666666-6666-6666-6666-666666666666";
const STABLE = "77777777-7777-7777-7777-777777777777";
const PERSON = "88888888-8888-8888-8888-888888888888";
const OTHER_PERSON = "99999999-9999-9999-9999-999999999999";

const baseUser = {
  kind: "user" as const,
  userId: "u",
  personId: PERSON,
  emailVerified: true,
  suspended: false,
  platformAdmin: false,
  organizations: [],
  referentOfStableIds: [],
};

const anonimo: Actor = { kind: "anonymous" };
const organizzatore: Actor = {
  ...baseUser,
  organizations: [{ organizationId: ORG, role: "titolare", vetted: true }],
};
const organizzatoreNonVetted: Actor = {
  ...baseUser,
  organizations: [{ organizationId: ORG, role: "titolare", vetted: false }],
};
const segreteriaOrg: Actor = {
  ...baseUser,
  organizations: [{ organizationId: ORG, role: "segreteria", vetted: true }],
};
const scuderia: Actor = { ...baseUser, referentOfStableIds: [STABLE] };
const concorrente: Actor = { ...baseUser };
const admin: Actor = { ...baseUser, personId: null, platformAdmin: true };
const sospeso: Actor = { ...baseUser, suspended: true };
const giudice: Actor = {
  kind: "invite",
  personId: PERSON,
  eventId: EVENT,
  role: "giudice",
  classIds: null,
};
const scribe: Actor = { ...giudice, role: "scribe" };
const segreteriaEvento: Actor = { ...giudice, role: "segreteria" };

const onOrg: ResourceCtx = { organizationId: ORG, eventId: EVENT };
const onEvent: ResourceCtx = { eventId: EVENT };

type Row = [
  string,
  Capability,
  ResourceCtx,
  Array<[string, Actor, boolean]>,
];

const rows: Row[] = [
  [
    // BR-80: la preparazione in bozza non aspetta il vetting — è la
    // pubblicazione (event.configure via setStatus) a essere gated.
    "prepara l'evento in bozza",
    "event.prepare",
    onOrg,
    [
      ["organizzatore ✓", organizzatore, true],
      ["organizzatore non vetted ✓ (bozza)", organizzatoreNonVetted, true],
      ["segreteria org —", segreteriaOrg, false],
      ["scuderia —", scuderia, false],
      ["concorrente —", concorrente, false],
      ["giudice —", giudice, false],
      ["admin — (BR-70: fuori matrice)", admin, false],
      ["anonimo —", anonimo, false],
    ],
  ],
  [
    "crea e configura evento",
    "event.configure",
    onOrg,
    [
      ["organizzatore ✓", organizzatore, true],
      ["organizzatore non vetted —", organizzatoreNonVetted, false],
      ["segreteria org —", segreteriaOrg, false],
      ["scuderia —", scuderia, false],
      ["concorrente —", concorrente, false],
      ["giudice —", giudice, false],
      ["admin — (BR-70: fuori matrice)", admin, false],
      ["anonimo —", anonimo, false],
    ],
  ],
  [
    "gestisce anagrafiche dell'evento",
    "event.registry.manage",
    onOrg,
    [
      ["organizzatore ✓", organizzatore, true],
      ["segreteria org ◐", segreteriaOrg, true],
      ["segreteria evento ◐", segreteriaEvento, true],
      ["scribe —", scribe, false],
      ["concorrente —", concorrente, false],
    ],
  ],
  [
    "check-in binomi",
    "event.checkin",
    onOrg,
    [
      ["organizzatore ✓", organizzatore, true],
      ["segreteria org ✓", segreteriaOrg, true],
      ["segreteria evento ✓", segreteriaEvento, true],
      ["giudice —", giudice, false],
      ["scuderia —", scuderia, false],
    ],
  ],
  [
    "genera e modifica il draw",
    "event.draw.manage",
    onOrg,
    [
      ["organizzatore ✓", organizzatore, true],
      ["segreteria org ◐", segreteriaOrg, true],
      ["concorrente —", concorrente, false],
    ],
  ],
  [
    "inserisce i punteggi",
    "score.insert",
    onEvent,
    [
      ["scribe ✓", scribe, true],
      ["giudice ◐", giudice, true],
      ["segreteria evento —", segreteriaEvento, false],
      ["organizzatore —", organizzatore, false],
      ["admin —", admin, false],
    ],
  ],
  [
    "firma la ScoreCard",
    "scorecard.sign",
    onEvent,
    [
      ["giudice ✓", giudice, true],
      ["scribe —", scribe, false],
      ["organizzatore —", organizzatore, false],
    ],
  ],
  [
    "valida e pubblica i risultati",
    "results.validate",
    onOrg,
    [
      ["organizzatore ✓", organizzatore, true],
      ["segreteria org —", segreteriaOrg, false],
      ["giudice —", giudice, false],
    ],
  ],
  [
    "corregge uno score pubblicato",
    "score.correct",
    onOrg,
    [
      ["organizzatore ✓", organizzatore, true],
      ["segreteria org —", segreteriaOrg, false],
      ["admin — (passa dai flussi BR-40/41)", admin, false],
    ],
  ],
  [
    "iscrizione massiva",
    "entries.bulk",
    { stableId: STABLE },
    [
      ["scuderia ✓", scuderia, true],
      ["concorrente —", concorrente, false],
      ["organizzatore —", organizzatore, false],
    ],
  ],
  [
    "iscrizione individuale",
    "entries.own",
    { personId: PERSON },
    [
      ["concorrente ✓", concorrente, true],
      ["altro concorrente — (dati altrui)", { ...concorrente, personId: OTHER_PERSON }, false],
      ["giudice —", giudice, false],
      ["anonimo —", anonimo, false],
    ],
  ],
  [
    "gestisce il roster",
    "roster.manage",
    { stableId: STABLE },
    [
      ["scuderia ✓", scuderia, true],
      ["concorrente — (scuderia altrui)", concorrente, false],
    ],
  ],
  [
    "vede i risultati propri",
    "results.own.view",
    { personId: PERSON },
    [
      ["concorrente ✓", concorrente, true],
      ["altro utente —", { ...concorrente, personId: OTHER_PERSON }, false],
    ],
  ],
  [
    "vede calendario e risultati pubblici",
    "public.view",
    {},
    [
      ["pubblico ✓", anonimo, true],
      ["sospeso ✓ (resta la vista pubblica)", sospeso, true],
      ["giudice ✓", giudice, true],
    ],
  ],
  [
    "gestisce payout e rendicontazione",
    "payout.manage",
    onOrg,
    [
      ["organizzatore ✓", organizzatore, true],
      ["segreteria org —", segreteriaOrg, false],
      ["scuderia —", scuderia, false],
    ],
  ],
];

describe("matrice ruoli/permessi (spec)", () => {
  for (const [rowName, capability, resource, cases] of rows) {
    describe(rowName, () => {
      for (const [caseName, actor, expected] of cases) {
        it(caseName, () => {
          expect(can(actor, capability, resource)).toBe(expected);
        });
      }
    });
  }
});

describe("scoping degli attori event-scoped", () => {
  it("il giudice non firma su un altro evento", () => {
    expect(can(giudice, "scorecard.sign", { eventId: OTHER_EVENT })).toBe(false);
  });

  it("l'assegnazione limitata a una classe non copre le altre", () => {
    const giudiceDiClasse: Actor = { ...giudice, classIds: [CLASS] };
    expect(
      can(giudiceDiClasse, "scorecard.sign", { eventId: EVENT, classId: CLASS }),
    ).toBe(true);
    expect(
      can(giudiceDiClasse, "scorecard.sign", {
        eventId: EVENT,
        classId: OTHER_CLASS,
      }),
    ).toBe(false);
  });

  it("la segreteria event-scoped non agisce su altri eventi", () => {
    expect(
      can(segreteriaEvento, "event.checkin", { eventId: OTHER_EVENT }),
    ).toBe(false);
  });
});

describe("Platform Admin (BR-70) e sospensione", () => {
  it("le capacità admin richiedono il flag", () => {
    for (const c of ["admin.vetting", "admin.users.suspend", "admin.audit.view"] as const) {
      expect(can(admin, c)).toBe(true);
      expect(can(organizzatore, c)).toBe(false);
      expect(can(anonimo, c)).toBe(false);
    }
  });

  it("un utente sospeso perde tutto tranne la vista pubblica", () => {
    const sospesoOrganizzatore: Actor = { ...organizzatore, suspended: true };
    expect(can(sospesoOrganizzatore, "event.configure", onOrg)).toBe(false);
    expect(can(sospesoOrganizzatore, "results.validate", onOrg)).toBe(false);
    expect(can(sospesoOrganizzatore, "public.view")).toBe(true);
  });

  it("l'organizzatore non agisce sulle organizzazioni altrui", () => {
    expect(
      can(organizzatore, "event.configure", { organizationId: OTHER_ORG }),
    ).toBe(false);
  });
});
