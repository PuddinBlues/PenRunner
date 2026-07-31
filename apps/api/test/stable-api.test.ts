import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@penrunner/db";
import {
  futureDate,
  registerUserWithProfile,
  setupApi,
  type TestApi,
} from "./helpers.js";

// ---------------------------------------------------------------------------
// Superficie API per la UI scuderia: eventi aperti con quote, info di
// iscrizione con posti rimasti (capienza = vincolo, non eleggibilità),
// dedup esplicito del roster (linked), vista "le mie iscrizioni".
// ---------------------------------------------------------------------------

let api: TestApi;
let stableToken: string;
let organizerToken: string;
let stableId: string;
let eventId: string;
let classId: string;
let riderId: string;
let horseId: string;

beforeAll(async () => {
  api = await setupApi();

  // Organizzatore vetted con evento a iscrizioni aperte.
  const organizer = await registerUserWithProfile(
    api,
    "club@stable-test.example",
    "Referente Club",
  );
  organizerToken = organizer.sessionToken;
  let orgCaller = await api.as(organizer.sessionToken);
  const { organizationId } = await orgCaller.org.create({ name: "Club Test" });
  const admin = await registerUserWithProfile(
    api,
    "staff@stable-test.example",
    "Staff",
  );
  await api.db
    .update(schema.users)
    .set({ platformAdmin: true })
    .where(eq(schema.users.id, admin.userId));
  const adminCaller = await api.as(admin.sessionToken);
  await adminCaller.admin.approveOrganization({ organizationId });
  orgCaller = await api.as(organizer.sessionToken);
  ({ eventId } = await orgCaller.events.create({
    organizationId,
    name: "Evento Scuderie",
    venue: "Arena",
    startDate: futureDate(45),
    endDate: futureDate(46),
    feePerHorse: "15",
  }));
  const anon = await api.as();
  const categories = await anon.catalog.categories();
  const patterns = await anon.catalog.patterns();
  ({ classId } = await orgCaller.classes.create({
    eventId,
    categoryId: categories[0]!.id,
    patternId: patterns[0]!.id,
    name: "Open Scuderie",
    entryFee: "100",
    maxEntries: 10,
  }));
  await orgCaller.events.setStatus({ eventId, status: "annunciato" });
  await orgCaller.events.setStatus({ eventId, status: "iscrizioni_aperte" });

  // Scuderia self-serve.
  const stableUser = await registerUserWithProfile(
    api,
    "scuderia@stable-test.example",
    "Referente Scuderia",
  );
  stableToken = stableUser.sessionToken;
  const caller = await api.as(stableToken);
  ({ stableId } = await caller.roster.createStable({ name: "Quarter Team" }));
});

afterAll(async () => {
  await api.close();
});

describe("scoperta eventi e quote (griglia iscrizione)", () => {
  it("openEvents elenca solo iscrizioni aperte, con la quota al cavaliere", async () => {
    const caller = await api.as(stableToken);
    const open = await caller.entries.openEvents();
    const ev = open.find((e) => e.id === eventId);
    expect(ev).toBeDefined();
    expect(Number(ev!.feePerHorse)).toBe(15);
  });

  it("enrollmentInfo espone classi, quote e posti rimasti", async () => {
    const caller = await api.as(stableToken);
    const info = await caller.entries.enrollmentInfo({ eventId });
    expect(info.event.name).toBe("Evento Scuderie");
    expect(info.classes).toHaveLength(1);
    expect(Number(info.classes[0]!.entryFee)).toBe(100);
    expect(info.classes[0]!.remaining).toBe(10);
  });
});

describe("roster: il dedup è esplicito", () => {
  it("email nuova → creato; stessa email altrove → COLLEGATO, mai duplicato", async () => {
    const caller = await api.as(stableToken);
    const first = await caller.roster.addRider({
      stableId,
      firstName: "Anna", lastName: "Verdi",
      email: "anna.verdi@example.com",
      birthDate: "1990-01-15",
    });
    expect(first.linked).toBe(false);
    riderId = first.personId;

    const { stableId: otherStable } = await caller.roster.createStable({
      name: "Seconda Scuderia",
    });
    // actor fresco: la nuova scuderia si risolve alla creazione del caller
    const fresh = await api.as(stableToken);
    const again = await fresh.roster.addRider({
      stableId: otherStable,
      firstName: "Anna", lastName: "V.",
      email: "ANNA.VERDI@example.com", // case-insensitive
    });
    expect(again.linked).toBe(true);
    expect(again.personId).toBe(riderId);
  });
});

describe("le mie iscrizioni (byStable)", () => {
  it("mostra i binomi della scuderia con stato e draw number", async () => {
    const caller = await api.as(stableToken);
    const horse = await caller.roster.addHorse({
      stableId,
      name: "Whiz Dream",
      microchip: "380271000000777",
      ownerPersonId: riderId,
    });
    horseId = horse.horseId;
    const { entries } = await caller.entries.bulkCreate({
      stableId,
      items: [{ classId, horseId, riderId }],
    });
    await caller.entries.confirm({ entryIds: entries.map((e) => e.entryId) });

    const mine = await caller.entries.byStable({ stableId });
    expect(mine).toHaveLength(1);
    expect(mine[0]!.status).toBe("confermata");
    expect(mine[0]!.drawNumber).toBeNull(); // draw non ancora pubblicato
    expect(mine[0]!.horseName).toBe("Whiz Dream");
    expect(mine[0]!.eventName).toBe("Evento Scuderie");
    // i posti rimasti scendono
    const info = await caller.entries.enrollmentInfo({ eventId });
    expect(info.classes[0]!.remaining).toBe(9);
  });

  it("PR-0: il duplicato viene rifiutato NOMINANDO cavallo e classe, prima del checkout", async () => {
    const caller = await api.as(stableToken);
    // Whiz Dream è già confermato in questa classe dal test sopra.
    await expect(
      caller.entries.bulkCreate({
        stableId,
        items: [{ classId, horseId, riderId }],
      }),
    ).rejects.toThrow(/«Whiz Dream» è già iscritto a «/);
    // Duplicato NELLA STESSA griglia (due righe, stessa coppia): stesso esito.
    const horse2 = await caller.roster.addHorse({
      stableId,
      name: "Gun Smart",
      microchip: "380271000000778",
      ownerPersonId: riderId,
    });
    await expect(
      caller.entries.bulkCreate({
        stableId,
        items: [
          { classId, horseId: horse2.horseId, riderId },
          { classId, horseId: horse2.horseId, riderId },
        ],
      }),
    ).rejects.toThrow(/«Gun Smart» è già iscritto a «/);
    // tutto-o-niente: il batch fallito non lascia iscrizioni orfane
    const mine = await caller.entries.byStable({ stableId });
    expect(mine).toHaveLength(1);
  });

  it("PR-0: enrollmentInfo espone le coppie già iscritte (chip disabilitate in griglia)", async () => {
    const caller = await api.as(stableToken);
    const info = await caller.entries.enrollmentInfo({ eventId });
    expect(info.enrolled).toContainEqual({
      classId,
      horseId,
      status: "confermata",
    });
  });

  it("FASE B: l'avviso si risolve dove si vede — updateRider completa il profilo", async () => {
    const caller = await api.as(stableToken);
    // Prima: il profilo è senza tesseramenti → un'iscrizione produce avvisi.
    await caller.roster.updateRider({
      stableId,
      personId: riderId,
      firstName: "Anna",
      lastName: "Verdi",
      membershipIrha: "IRHA-12345",
      membershipFise: "1GR/2GR",
      birthDate: "1990-05-01",
    });
    const roster = await caller.roster.list({ stableId });
    const me = roster.members.find((m) => m.personId === riderId)!;
    expect(me.membershipIrha).toBe("IRHA-12345");
    expect(me.membershipFise).toBe("1GR/2GR");
    expect(me.birthDate).toBe("1990-05-01");

    // Dopo: una nuova iscrizione NON produce più gli avvisi di tesseramento.
    const horse3 = await caller.roster.addHorse({
      stableId,
      name: "Chic Olena Star",
      microchip: "380271000000779",
      ownerPersonId: riderId,
    });
    const { entries } = await caller.entries.bulkCreate({
      stableId,
      items: [{ classId, horseId: horse3.horseId, riderId }],
    });
    const codes = entries[0]!.warnings.map((w) => w.code);
    expect(codes).not.toContain("fise_license_missing");
    expect(codes).not.toContain("irha_membership_missing");
  });

  it("B3: il binomio flaggato compare in regia e 'avvisa la scuderia' manda l'email umana", async () => {
    const caller = await api.as(stableToken);
    // binomio nuovo con profilo vuoto → controlli aperti
    const rider = await caller.roster.addRider({
      stableId,
      firstName: "Nino",
      lastName: "Senza Dati",
      email: "nino@example.com",
    });
    const horse = await caller.roster.addHorse({
      stableId,
      name: "Flag Me",
      microchip: "380271000000999",
      ownerPersonId: rider.personId,
    });
    const { entries } = await caller.entries.bulkCreate({
      stableId,
      items: [{ classId, horseId: horse.horseId, riderId: rider.personId }],
    });
    await caller.entries.confirm({ entryIds: entries.map((e) => e.entryId) });

    // lato regia: lista dei flaggati con avvisi LIVE
    const org = await api.as(organizerToken);
    const flagged = await org.entries.flaggedByEvent({ eventId });
    const row = flagged.find((r) => r.horseName === "Flag Me");
    expect(row).toBeDefined();
    expect(row!.warnings.map((w) => w.code)).toContain("irha_membership_missing");

    // la scuderia NON può usare la vista regia
    await expect(caller.entries.flaggedByEvent({ eventId })).rejects.toThrow(
      /FORBIDDEN/,
    );

    // un tocco → email al referente della scuderia, in linguaggio umano
    const res = await org.entries.notifyFlagged({ entryId: row!.entryId });
    expect(res.sentTo).toBe("scuderia@stable-test.example");
    const mail = JSON.stringify(api.mailer.lastTo("scuderia@stable-test.example"));
    expect(mail).toMatch(/Controlli sull'iscrizione · Flag Me/);
    expect(mail).toMatch(/Tesseramento IRHA mancante/);
    expect(mail).not.toMatch(/BR-\d+/); // confine dei codici anche via email

    // auditata (BR-71)
    const audit = await api.db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, "vetting.notify"));
    expect(audit).toHaveLength(1);
  });

  it("chi non è referente non vede il roster altrui", async () => {
    const other = await registerUserWithProfile(
      api,
      "altro@stable-test.example",
      "Altro Utente",
    );
    const caller = await api.as(other.sessionToken);
    await expect(caller.entries.byStable({ stableId })).rejects.toThrow(
      /FORBIDDEN/,
    );
  });
});
