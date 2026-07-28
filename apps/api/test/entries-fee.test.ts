import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@penrunner/db";
import {
  registerUserWithProfile,
  setupApi,
  type TestApi,
} from "./helpers.js";

// ---------------------------------------------------------------------------
// Flusso C end-to-end: roster (dedup, M2M), iscrizione singola e massiva,
// fee derivate (BR-01/02/03), scratch (BR-17), check-in con avvisi aperti
// (BR-18), platform fee solo admin (BR-02/71).
// ---------------------------------------------------------------------------

let api: TestApi;
let organizerToken: string;
let adminToken: string;
let orgId: string;
let eventId: string;
let classOpenId: string; // categoria 101, entry fee 75
let classGreenId: string; // categoria 70 (tecnico richiesto), entry fee 35
let stableId: string;
let riderPersonId: string;
let horseAId: string;
let horseBId: string;

beforeAll(async () => {
  api = await setupApi();

  const organizer = await registerUserWithProfile(
    api,
    "club@example.com",
    "Referente Club",
  );
  organizerToken = organizer.sessionToken;
  let caller = await api.as(organizerToken);
  ({ organizationId: orgId } = await caller.org.create({
    name: "Reining Club Lombardia",
  }));

  const admin = await registerUserWithProfile(
    api,
    "staff@penrunner.example",
    "Staff PenRunner",
  );
  adminToken = admin.sessionToken;
  await api.db
    .update(schema.users)
    .set({ platformAdmin: true })
    .where(eq(schema.users.id, admin.userId));
  const adminCaller = await api.as(adminToken);
  await adminCaller.admin.approveOrganization({ organizationId: orgId });

  caller = await api.as(organizerToken);
  ({ eventId } = await caller.events.create({
    organizationId: orgId,
    name: "Summer Slide 2026",
    venue: "Arena Lombardia",
    startDate: "2026-09-01",
    endDate: "2026-09-02",
  }));
  await caller.events.setStatus({ eventId, status: "iscrizioni_aperte" });

  const [pattern] = await api.db.select().from(schema.patterns).limit(1);
  const [catOpen] = await api.db
    .select()
    .from(schema.categories)
    .where(eq(schema.categories.code, "101"));
  const [catGreen] = await api.db
    .select()
    .from(schema.categories)
    .where(eq(schema.categories.code, "70"));

  const inserted = await api.db
    .insert(schema.classes)
    .values([
      {
        eventId,
        categoryId: catOpen!.id,
        name: "Open",
        patternId: pattern!.id,
        entryFee: "75",
      },
      {
        eventId,
        categoryId: catGreen!.id,
        name: "Green",
        patternId: pattern!.id,
        entryFee: "35",
      },
    ])
    .returning();
  classOpenId = inserted[0]!.id;
  classGreenId = inserted[1]!.id;

  // Roster della scuderia.
  const stableOwner = await registerUserWithProfile(
    api,
    "scuderia@example.com",
    "Referente Scuderia",
  );
  let stableCaller = await api.as(stableOwner.sessionToken);
  ({ stableId } = await stableCaller.roster.createStable({
    name: "Quarter Ranch",
  }));
  // l'actor si risolve alla creazione del caller: refresh dopo createStable
  stableCaller = await api.as(stableOwner.sessionToken);
  const owner = await stableCaller.roster.addRider({
    stableId,
    firstName: "Anna", lastName: "Proprietaria",
    email: "anna@example.com",
  });
  const rider = await stableCaller.roster.addRider({
    stableId,
    firstName: "Marco", lastName: "Cavaliere",
    email: "marco.rider@example.com",
    membershipIrha: "IRHA-1",
    membershipFise: "FISE-1",
  });
  riderPersonId = rider.personId;
  const horseA = await stableCaller.roster.addHorse({
    stableId,
    microchip: "380-A",
    name: "Gun Smoke",
    ownerPersonId: rider.personId, // di proprietà del cavaliere
  });
  horseAId = horseA.horseId;
  const horseB = await stableCaller.roster.addHorse({
    stableId,
    microchip: "380-B",
    name: "Whiz Kid",
    ownerPersonId: owner.personId, // di un altro proprietario
  });
  horseBId = horseB.horseId;
  // token della scuderia riusato nei test
  stableToken = stableOwner.sessionToken;
});

let stableToken: string;

afterAll(async () => {
  await api.close();
});

describe("roster: dedup e molti-a-molti", () => {
  it("stesso microchip → collega (cambio scuderia), non duplica", async () => {
    const other = await registerUserWithProfile(
      api,
      "altra.scuderia@example.com",
      "Altra Scuderia",
    );
    let otherCaller = await api.as(other.sessionToken);
    const { stableId: otherStableId } = await otherCaller.roster.createStable({
      name: "Altro Ranch",
    });
    otherCaller = await api.as(other.sessionToken);
    const res = await otherCaller.roster.addHorse({
      stableId: otherStableId,
      microchip: "380-A",
      name: "Gun Smoke clone?",
    });
    expect(res.linked).toBe(true);
    expect(res.horseId).toBe(horseAId);
    const all = await api.db
      .select()
      .from(schema.horses)
      .where(eq(schema.horses.microchip, "380-A"));
    expect(all).toHaveLength(1);
    expect(all[0]!.stableId).toBe(otherStableId); // relazione aggiornata

    // riportiamo il cavallo alla scuderia originale per i test successivi
    const stableCaller = await api.as(stableToken);
    await stableCaller.roster.addHorse({
      stableId,
      microchip: "380-A",
      name: "Gun Smoke",
    });
  });

  it("stessa email → stessa person in due roster (M2M), profilo unico", async () => {
    const other = await registerUserWithProfile(
      api,
      "terza.scuderia@example.com",
      "Terza Scuderia",
    );
    let otherCaller = await api.as(other.sessionToken);
    const { stableId: thirdStableId } = await otherCaller.roster.createStable({
      name: "Terzo Ranch",
    });
    otherCaller = await api.as(other.sessionToken);
    const res = await otherCaller.roster.addRider({
      stableId: thirdStableId,
      firstName: "Marco", lastName: "Omonimo",
      email: "MARCO.RIDER@example.com", // case diverso, stessa identità
    });
    expect(res.personId).toBe(riderPersonId);
    const memberships = await api.db
      .select()
      .from(schema.stableMembers)
      .where(eq(schema.stableMembers.personId, riderPersonId));
    expect(memberships.map((m) => m.stableId).sort()).toEqual(
      [stableId, thirdStableId].sort(),
    );
  });
});

describe("iscrizione massiva e fee derivate", () => {
  let entryIds: string[] = [];

  it("bulk: cavallo in 2 classi + secondo cavallo → fee per cavallo DISTINTO (BR-01)", async () => {
    const caller = await api.as(stableToken);
    const { entries, quote } = await caller.entries.bulkCreate({
      stableId,
      items: [
        { classId: classOpenId, horseId: horseAId, riderId: riderPersonId },
        { classId: classGreenId, horseId: horseAId, riderId: riderPersonId },
        { classId: classOpenId, horseId: horseBId, riderId: riderPersonId },
      ],
    });
    entryIds = entries.map((e) => e.entryId);
    // il prototipo: 2 cavalli · 3 iscrizioni · costo classi 75+35+75 · fee 2×15
    expect(quote).toEqual({
      horses: 2,
      enrollments: 3,
      classesCost: 185,
      fee: 30,
      total: 215,
    });
  });

  it("BR-11: lo stesso cavallo due volte nella stessa classe → bloccato (integrità)", async () => {
    const caller = await api.as(stableToken);
    await expect(
      caller.entries.bulkCreate({
        stableId,
        items: [
          { classId: classOpenId, horseId: horseAId, riderId: riderPersonId },
        ],
      }),
    ).rejects.toThrow(/già iscritto/);
  });

  it("conferma: avvisi fotografati sull'iscrizione, mai bloccanti (BR-18)", async () => {
    const caller = await api.as(stableToken);
    const { confirmed, quote } = await caller.entries.confirm({ entryIds });
    expect(confirmed).toBe(3);
    expect(quote.total).toBe(215);

    // La Green (cat. 70) richiede il tecnico: avviso BR-16 in snapshot;
    // horseB non è del cavaliere: nessun avviso per la 101 (non di proprietà).
    const [greenEntry] = await api.db
      .select()
      .from(schema.entries)
      .where(
        and(
          eq(schema.entries.classId, classGreenId),
          eq(schema.entries.horseId, horseAId),
        ),
      );
    const codes = (greenEntry!.eligibilityWarnings as Array<{ code: string }>).map(
      (w) => w.code,
    );
    expect(codes).toContain("tecnico_required");
    expect(greenEntry!.status).toBe("confermata");
  });

  it("feeSummary: default 15/15 → margine zero; conta i confermati", async () => {
    const caller = await api.as(organizerToken);
    const s = await caller.fees.summary({ eventId });
    expect(s).toMatchObject({
      distinctHorses: 2,
      feePerHorse: 15,
      platformFeePerHorse: 15,
      riderFeeTotal: 30,
      platformFeeTotal: 30,
      organizerMargin: 0,
    });
  });

  it("BR-18: il check-in si completa con avvisi aperti, che restano in traccia", async () => {
    const [greenEntry] = await api.db
      .select()
      .from(schema.entries)
      .where(
        and(
          eq(schema.entries.classId, classGreenId),
          eq(schema.entries.horseId, horseAId),
        ),
      );
    const caller = await api.as(organizerToken);
    await caller.entries.checkIn({ entryId: greenEntry!.id });

    // in "start list" (lista di classe) con lo stato check_in e gli avvisi
    // ancora visibili — traccia, non censura.
    const list = await caller.entries.listByClass({ classId: classGreenId });
    const row = list.find((e) => e.id === greenEntry!.id)!;
    expect(row.status).toBe("check_in");
    expect(
      (row.eligibilityWarnings as Array<{ code: string }>).map((w) => w.code),
    ).toContain("tecnico_required");
    expect(row.liveWarnings.map((w) => w.code)).toContain("tecnico_required");
  });

  it("scratch self-serve (BR-17 on): ritirata, ma la fee resta dovuta (BR-03)", async () => {
    const [openEntryB] = await api.db
      .select()
      .from(schema.entries)
      .where(
        and(
          eq(schema.entries.classId, classOpenId),
          eq(schema.entries.horseId, horseBId),
        ),
      );
    const caller = await api.as(stableToken);
    await caller.entries.scratch({ entryId: openEntryB!.id });
    const [after] = await api.db
      .select()
      .from(schema.entries)
      .where(eq(schema.entries.id, openEntryB!.id));
    expect(after!.status).toBe("ritirata");

    // il rendiconto non cambia: 2 cavalli distinti, ritiro incluso
    const orgCaller = await api.as(organizerToken);
    const s = await orgCaller.fees.summary({ eventId });
    expect(s.distinctHorses).toBe(2);
    expect(s.riderFeeTotal).toBe(30);
  });

  it("BR-17 off: il self-serve è negato, l'organizzatore registra comunque", async () => {
    await api.db
      .update(schema.events)
      .set({ selfScratchEnabled: false })
      .where(eq(schema.events.id, eventId));
    const [openEntryA] = await api.db
      .select()
      .from(schema.entries)
      .where(
        and(
          eq(schema.entries.classId, classOpenId),
          eq(schema.entries.horseId, horseAId),
        ),
      );
    const caller = await api.as(stableToken);
    await expect(
      caller.entries.scratch({ entryId: openEntryA!.id }),
    ).rejects.toThrow(/si comunica all'organizzazione/);

    const orgCaller = await api.as(organizerToken);
    await orgCaller.entries.scratch({ entryId: openEntryA!.id });
    const [after] = await api.db
      .select()
      .from(schema.entries)
      .where(eq(schema.entries.id, openEntryA!.id));
    expect(after!.status).toBe("ritirata");
    await api.db
      .update(schema.events)
      .set({ selfScratchEnabled: true })
      .where(eq(schema.events.id, eventId));
  });
});

describe("iscrizione individuale e capienza", () => {
  it("il concorrente iscrive il proprio binomio, con avvisi in risposta", async () => {
    const rider = await registerUserWithProfile(
      api,
      "solo.rider@example.com",
      "Rider Indipendente",
    );
    const caller = await api.as(rider.sessionToken);
    const horse = await api.db
      .insert(schema.horses)
      .values({
        name: "Freckles",
        microchip: "380-C",
        ownerId: rider.personId,
      })
      .returning();
    const res = await caller.entries.create({
      classId: classGreenId,
      horseId: horse[0]!.id,
      riderId: rider.personId,
    });
    expect(res.status).toBe("bozza");
    // cat. 70: tessera assente + tecnico mancante → avvisi, non blocchi
    expect(res.warnings.map((w) => w.code)).toContain("tecnico_required");
  });

  it("non si iscrive un binomio altrui", async () => {
    const intruder = await registerUserWithProfile(
      api,
      "intruso@example.com",
      "Utente Intruso",
    );
    const caller = await api.as(intruder.sessionToken);
    await expect(
      caller.entries.create({
        classId: classGreenId,
        horseId: horseAId,
        riderId: riderPersonId,
      }),
    ).rejects.toThrow(/FORBIDDEN/);
  });

  it("classe al completo (cap) → bloccata: capienza, non eleggibilità", async () => {
    await api.db
      .update(schema.classes)
      .set({ maxEntries: 1 })
      .where(eq(schema.classes.id, classGreenId));
    const caller = await api.as(stableToken);
    await expect(
      caller.entries.bulkCreate({
        stableId,
        items: [
          { classId: classGreenId, horseId: horseBId, riderId: riderPersonId },
        ],
      }),
    ).rejects.toThrow(/al completo/);
    await api.db
      .update(schema.classes)
      .set({ maxEntries: null })
      .where(eq(schema.classes.id, classGreenId));
  });
});

describe("platform fee (BR-02): solo admin, sempre auditata", () => {
  it("l'organizzatore NON ha scrittura sulla propria quota", async () => {
    const caller = await api.as(organizerToken);
    await expect(
      caller.admin.setOrganizationPlatformFee({
        organizationId: orgId,
        platformFeePerHorse: 1,
      }),
    ).rejects.toThrow(/FORBIDDEN/);
  });

  it("l'admin concede 10 €/cavallo: margine all'organizzatore, audit scritto", async () => {
    const adminCaller = await api.as(adminToken);
    await adminCaller.admin.setOrganizationPlatformFee({
      organizationId: orgId,
      platformFeePerHorse: 10,
      note: "Accordo circuito Lombardia 2026",
    });
    const caller = await api.as(organizerToken);
    const s = await caller.fees.summary({ eventId });
    expect(s.platformFeePerHorse).toBe(10);
    expect(s.platformFeeTotal).toBe(20);
    expect(s.organizerMargin).toBe(10); // 30 − 20

    const audit = await api.db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, "organization.platform_fee.set"));
    expect(audit).toHaveLength(1);
    expect(audit[0]!.note).toBe("Accordo circuito Lombardia 2026");
    expect(audit[0]!.before).toEqual({ platformFeePerHorse: "15.00" });
    expect(audit[0]!.after).toEqual({ platformFeePerHorse: "10.00" });
  });

  it("override per evento, e rimozione che torna alla quota organizzazione", async () => {
    const adminCaller = await api.as(adminToken);
    await adminCaller.admin.setEventPlatformFee({
      eventId,
      platformFeePerHorse: 12,
    });
    const caller = await api.as(organizerToken);
    expect((await caller.fees.summary({ eventId })).platformFeePerHorse).toBe(12);

    await adminCaller.admin.setEventPlatformFee({
      eventId,
      platformFeePerHorse: null,
    });
    expect((await caller.fees.summary({ eventId })).platformFeePerHorse).toBe(10);

    const audit = await api.db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, "event.platform_fee.set"));
    expect(audit).toHaveLength(2);
  });
});
