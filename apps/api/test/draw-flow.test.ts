import { and, asc, eq, isNotNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@penrunner/db";
import {
  registerUserWithProfile,
  setupApi,
  type TestApi,
} from "./helpers.js";

// ---------------------------------------------------------------------------
// Flusso E end-to-end: generazione con distanziamento, pubblicazione con run,
// buco da scratch senza ricompattamento, marker di drag live (BR-51),
// chirurgia come capacità concessa (BR-43), cutoff scratch run-based (BR-17).
// ---------------------------------------------------------------------------

let api: TestApi;
let organizerToken: string;
let adminToken: string;
let orgId: string;
let eventId: string;
let classId: string;
let doppioRiderId: string;
let doppioRiderToken: string;
const entryIdByHorse = new Map<string, string>();

async function drawNumbers(): Promise<Map<string, number | null>> {
  const rows = await api.db
    .select()
    .from(schema.entries)
    .where(eq(schema.entries.classId, classId));
  return new Map(rows.map((r) => [r.id, r.drawNumber]));
}

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
    name: "Autumn Slide 2026",
    venue: "Arena",
    startDate: "2026-10-01",
    endDate: "2026-10-02",
  }));

  const [pattern] = await api.db.select().from(schema.patterns).limit(1);
  const [category] = await api.db
    .select()
    .from(schema.categories)
    .where(eq(schema.categories.code, "101"));
  const [cls] = await api.db
    .insert(schema.classes)
    .values({
      eventId,
      categoryId: category!.id,
      name: "Open draw test",
      patternId: pattern!.id,
    })
    .returning();
  classId = cls!.id;

  // 12 binomi confermati: 10 cavalieri singoli + 1 cavaliere con 2 cavalli.
  // Il cavaliere doppio ha un account (per il test di scratch self-serve).
  const doppio = await registerUserWithProfile(
    api,
    "doppio@example.com",
    "Cavaliere Doppio",
  );
  doppioRiderId = doppio.personId;
  doppioRiderToken = doppio.sessionToken;
  const riderIds: string[] = [];
  for (let i = 0; i < 10; i++) {
    const [p] = await api.db
      .insert(schema.persons)
      .values({ fullName: `Rider ${i}`, email: `rider${i}@example.com` })
      .returning();
    riderIds.push(p!.id);
  }
  const pairs: Array<[string, string]> = [];
  for (const [i, riderId] of riderIds.entries()) {
    const [h] = await api.db
      .insert(schema.horses)
      .values({ name: `Horse ${i}`, microchip: `380-D-${i}`, ownerId: riderId })
      .returning();
    pairs.push([h!.id, riderId]);
  }
  for (const n of [1, 2]) {
    const [h] = await api.db
      .insert(schema.horses)
      .values({
        name: `Doppio ${n}`,
        microchip: `380-DD-${n}`,
        ownerId: doppioRiderId,
      })
      .returning();
    pairs.push([h!.id, doppioRiderId]);
  }
  for (const [horseId, riderId] of pairs) {
    const [e] = await api.db
      .insert(schema.entries)
      .values({ classId, horseId, riderId, status: "confermata" })
      .returning();
    entryIdByHorse.set(horseId, e!.id);
  }
});

afterAll(async () => {
  await api.close();
});

describe("generazione e pubblicazione", () => {
  it("genera con distanziamento default 8 per il cavaliere doppio (BR-19)", async () => {
    const caller = await api.as(organizerToken);
    const res = await caller.draw.generate({ classId });
    expect(res.order).toHaveLength(12);
    expect(res.targetGap).toBe(8);
    expect(res.warnings).toEqual([]);
    const rows = await api.db
      .select()
      .from(schema.entries)
      .where(
        and(eq(schema.entries.classId, classId), eq(schema.entries.riderId, doppioRiderId)),
      );
    const [a, b] = rows.map((r) => r.drawNumber!).sort((x, y) => x - y);
    expect(b! - a! - 1).toBeGreaterThanOrEqual(8);
  });

  it("re-draw libero finché in bozza; dopo la pubblicazione è negato", async () => {
    const caller = await api.as(organizerToken);
    await caller.draw.generate({ classId }); // re-draw: ancora permesso
    const { published } = await caller.draw.publish({ classId });
    expect(published).toBe(12);
    await expect(caller.draw.generate({ classId })).rejects.toThrow(
      /niente re-draw/,
    );
  });

  it("la pubblicazione crea le run (go 1, attesa), una per binomio sorteggiato", async () => {
    const runs = await api.db
      .select({ run: schema.runs, entry: schema.entries })
      .from(schema.runs)
      .innerJoin(schema.entries, eq(schema.entries.id, schema.runs.entryId))
      .where(eq(schema.entries.classId, classId));
    expect(runs).toHaveLength(12);
    for (const r of runs) {
      expect(r.run.status).toBe("attesa");
      expect(r.run.goRound).toBe(1);
      expect(r.entry.drawNumber).not.toBeNull();
    }
  });

  it("start list pubblica (anche anonima) con i marker di drag [5, 10]", async () => {
    const anon = await api.as();
    const sl = await anon.draw.startList({ classId });
    expect(sl.entries).toHaveLength(12);
    expect(sl.entries.map((e) => e.drawNumber)).toEqual(
      Array.from({ length: 12 }, (_, i) => i + 1),
    );
    expect(sl.dragAfter).toEqual([5, 10]);
  });
});

describe("scratch sul draw pubblicato (BR-17 + BR-51)", () => {
  it("il buco resta, la numerazione NON cambia, il confine del drag si sposta", async () => {
    const before = await drawNumbers();
    // scratch self-serve del binomio in posizione 3
    const [target] = await api.db
      .select()
      .from(schema.entries)
      .where(and(eq(schema.entries.classId, classId), eq(schema.entries.drawNumber, 3)));

    // se il n°3 non è del cavaliere doppio lo fa l'organizzatore (titolarità)
    const caller =
      target!.riderId === doppioRiderId
        ? await api.as(doppioRiderToken)
        : await api.as(organizerToken);
    await caller.entries.scratch({ entryId: target!.id });

    // numerazione invariata per TUTTI (nessun ricompattamento)
    expect(await drawNumbers()).toEqual(before);

    // la run in attesa del ritirato è sparita
    const runs = await api.db
      .select()
      .from(schema.runs)
      .where(eq(schema.runs.entryId, target!.id));
    expect(runs).toHaveLength(0);

    // il marker di drag si sposta: 5ª run effettiva ora è il n° 6 (BR-51)
    const anon = await api.as();
    const sl = await anon.draw.startList({ classId });
    expect(sl.dragAfter).toEqual([6, 11]);
    const scratched = sl.entries.find((e) => e.drawNumber === 3)!;
    expect(scratched.scratched).toBe(true);
  });

  it("cutoff 'fino al proprio turno': run avviata → self-serve negato", async () => {
    const [target] = await api.db
      .select({ entry: schema.entries })
      .from(schema.entries)
      .where(
        and(
          eq(schema.entries.classId, classId),
          eq(schema.entries.riderId, doppioRiderId),
        ),
      )
      .limit(1);
    await api.db
      .update(schema.runs)
      .set({ status: "in_inserimento" })
      .where(eq(schema.runs.entryId, target!.entry.id));
    const caller = await api.as(doppioRiderToken);
    await expect(
      caller.entries.scratch({ entryId: target!.entry.id }),
    ).rejects.toThrow(/turno del binomio è già iniziato/);
    await api.db
      .update(schema.runs)
      .set({ status: "attesa" })
      .where(eq(schema.runs.entryId, target!.entry.id));
  });
});

describe("chirurgia del draw = capacità concessa (BR-43)", () => {
  it("flag off (default): spostamenti e posizione concordata negati", async () => {
    const caller = await api.as(organizerToken);
    const nums = await drawNumbers();
    const anyEntry = [...nums.entries()].find(([, n]) => n === 4)![0];
    await expect(
      caller.draw.setPosition({ entryId: anyEntry, position: 99 }),
    ).rejects.toThrow(/non è abilitata per questo evento/);

    const [p] = await api.db
      .insert(schema.persons)
      .values({ fullName: "Late Rider" })
      .returning();
    const [h] = await api.db
      .insert(schema.horses)
      .values({ name: "Late Horse", microchip: "380-LATE-1", ownerId: p!.id })
      .returning();
    await expect(
      caller.draw.addLateEntry({
        classId,
        horseId: h!.id,
        riderId: p!.id,
        position: 99,
      }),
    ).rejects.toThrow(/non è abilitata per questo evento/);

    // ...ma la late entry IN CODA è sempre ammessa, con run e audit
    const late = await caller.draw.addLateEntry({
      classId,
      horseId: h!.id,
      riderId: p!.id,
    });
    expect(late.drawNumber).toBe(13);
    const runs = await api.db
      .select()
      .from(schema.runs)
      .where(eq(schema.runs.entryId, late.entryId));
    expect(runs).toHaveLength(1);
    const audit = await api.db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, "draw.late_entry.add"));
    expect(audit).toHaveLength(1);
  });

  it("concessione admin: auditata; l'organizzatore non può auto-concedersela", async () => {
    const caller = await api.as(organizerToken);
    await expect(
      caller.admin.setDrawSurgery({ eventId, enabled: true }),
    ).rejects.toThrow(/FORBIDDEN/);

    const adminCaller = await api.as(adminToken);
    await adminCaller.admin.setDrawSurgery({
      eventId,
      enabled: true,
      note: "Richiesta del club: errore di trascrizione",
    });
    const audit = await api.db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, "event.draw_surgery.set"));
    expect(audit).toHaveLength(1);
    expect(audit[0]!.before).toEqual({ drawSurgeryEnabled: false });
    expect(audit[0]!.after).toEqual({ drawSurgeryEnabled: true });
  });

  it("flag on: spostamento auditato; l'arrivo in prima posizione post-drag è annotato", async () => {
    const caller = await api.as(organizerToken);
    // con lo scratch del n°3, i confini sono dopo 6 e 11: la prima posizione
    // post-drag è la 7. Scambiamo il n°4 col n°7: chi arriva alla 7 va annotato.
    const nums = await drawNumbers();
    const at4 = [...nums.entries()].find(([, n]) => n === 4)![0];
    const at7 = [...nums.entries()].find(([, n]) => n === 7)![0];
    await caller.draw.swapPositions({ entryAId: at4, entryBId: at7 });

    const after = await drawNumbers();
    expect(after.get(at4)).toBe(7);
    expect(after.get(at7)).toBe(4);

    const audit = await api.db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, "draw.position.swap"));
    expect(audit).toHaveLength(1);
    expect(audit[0]!.note).toMatch(/prima partenza dopo il drag/);

    // setPosition su posizione libera, auditata con prima/dopo
    const res = await caller.draw.setPosition({ entryId: at4, position: 20 });
    expect(res.drawNumber).toBe(20);
    const setAudit = await api.db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, "draw.position.set"));
    expect(setAudit).toHaveLength(1);
    expect(setAudit[0]!.before).toEqual({ drawNumber: 7 });
    expect(setAudit[0]!.after).toEqual({ drawNumber: 20 });
    // posizione occupata → rifiutata
    await expect(
      caller.draw.setPosition({ entryId: at7, position: 20 }),
    ).rejects.toThrow(/già occupata/);
  });

  it("revoca admin: auditata, e la chirurgia torna negata", async () => {
    const adminCaller = await api.as(adminToken);
    await adminCaller.admin.setDrawSurgery({ eventId, enabled: false });
    const audit = await api.db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, "event.draw_surgery.set"))
      .orderBy(asc(schema.auditLog.occurredAt));
    expect(audit).toHaveLength(2);
    expect(audit[1]!.after).toEqual({ drawSurgeryEnabled: false });

    const caller = await api.as(organizerToken);
    const nums = await drawNumbers();
    const someEntry = [...nums.entries()].find(([, n]) => n === 5)![0];
    await expect(
      caller.draw.setPosition({ entryId: someEntry, position: 30 }),
    ).rejects.toThrow(/non è abilitata/);
  });
});
