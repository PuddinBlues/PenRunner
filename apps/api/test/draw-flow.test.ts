import { and, asc, eq, isNotNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@penrunner/db";
import {
  futureDate,
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
    startDate: futureDate(45),
    endDate: futureDate(46),
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
      .values({ firstName: "Rider", lastName: `${i}`, email: `rider${i}@example.com` })
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
  it("BR-91: senza override il target è il parametro dell'evento (default 10)", async () => {
    const caller = await api.as(organizerToken);
    const res = await caller.draw.generate({ classId });
    expect(res.targetGap).toBe(10);
    // l'override sotto il minimo di dominio è rifiutato a monte (zod min 8)
    await expect(
      caller.draw.generate({ classId, minRiderGap: 5 }),
    ).rejects.toThrow();
  });

  it("genera col distanziamento richiesto per il cavaliere doppio (BR-19/91)", async () => {
    const caller = await api.as(organizerToken);
    const res = await caller.draw.generate({ classId, minRiderGap: 8 });
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
    await caller.draw.generate({ classId, minRiderGap: 8 }); // re-draw: ancora permesso
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
  it("il buco resta, la numerazione NON cambia, il confine del drag NEMMENO", async () => {
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

    // BR-51 (validata col giudice): il marker NON si muove — lo scratch
    // accorcia il blocco, entrano in 4, il trattore resta dopo il n° 5
    const anon = await api.as();
    const sl = await anon.draw.startList({ classId });
    expect(sl.dragAfter).toEqual([5, 10]);
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
      .values({ firstName: "Late", lastName: "Rider" })
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
    // Confini FISSI dopo 5 e 10 (lo scratch del n°3 non li muove): la prima
    // partenza effettiva post-drag è la 6. Scambiamo il n°4 col n°6: chi
    // arriva alla 6 va annotato (arena pulita).
    const nums = await drawNumbers();
    const at4 = [...nums.entries()].find(([, n]) => n === 4)![0];
    const at6 = [...nums.entries()].find(([, n]) => n === 6)![0];
    await caller.draw.swapPositions({ entryAId: at4, entryBId: at6 });

    const after = await drawNumbers();
    expect(after.get(at4)).toBe(6);
    expect(after.get(at6)).toBe(4);

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
    expect(setAudit[0]!.before).toEqual({ drawNumber: 6 });
    expect(setAudit[0]!.after).toEqual({ drawNumber: 20 });
    // posizione occupata → rifiutata
    await expect(
      caller.draw.setPosition({ entryId: at6, position: 20 }),
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

describe("editor del draw (BR-91) + ri-pubblicazione a classe non iniziata (BR-43 via di mezzo)", () => {
  async function currentOrder(): Promise<string[]> {
    const rows = await api.db
      .select()
      .from(schema.entries)
      .where(and(eq(schema.entries.classId, classId), isNotNull(schema.entries.drawNumber)))
      .orderBy(asc(schema.entries.drawNumber));
    return rows.map((r) => r.id);
  }

  it("suggest propone senza scrivere nulla", async () => {
    const caller = await api.as(organizerToken);
    const before = await drawNumbers();
    const sug = await caller.draw.suggest({ classId });
    expect(new Set(sug.order).size).toBe(sug.order.length);
    expect(await drawNumbers()).toEqual(before);
  });

  it("un ordine che non è una permutazione dei sorteggiati è rifiutato", async () => {
    const caller = await api.as(organizerToken);
    const order = await currentOrder();
    await expect(
      caller.draw.reorder({ classId, order: order.slice(1) }),
    ).rejects.toThrow(/non corrisponde/);
  });

  it("classe pubblicata NON iniziata: il riordino è una RI-pubblicazione auditata con stamp pubblico", async () => {
    const caller = await api.as(organizerToken);
    const anon = await api.as();
    expect((await anon.draw.startList({ classId })).updatedAt).toBeNull();

    const order = await currentOrder();
    const reversed = [...order].reverse();
    const res = await caller.draw.reorder({ classId, order: reversed });
    expect(res.republished).toBe(true);

    // rinumerazione contigua 1..n nell'ordine proposto
    const after = await drawNumbers();
    reversed.forEach((id, i) => expect(after.get(id)).toBe(i + 1));

    // stamp visibile sulla start list pubblica + audit dedicato
    expect((await anon.draw.startList({ classId })).updatedAt).not.toBeNull();
    const audit = await api.db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, "draw.reorder.published"));
    expect(audit).toHaveLength(1);
    expect(audit[0]!.note).toMatch(/prima dell'inizio della classe/);
  });

  it("dalla prima run in campo il riordino torna sotto BR-43 piena", async () => {
    const caller = await api.as(organizerToken);
    const order = await currentOrder();
    const [anyRun] = await api.db
      .select({ id: schema.runs.id })
      .from(schema.runs)
      .innerJoin(schema.entries, eq(schema.entries.id, schema.runs.entryId))
      .where(eq(schema.entries.classId, classId))
      .limit(1);
    await api.db
      .update(schema.runs)
      .set({ status: "in_inserimento" })
      .where(eq(schema.runs.id, anyRun!.id));
    await expect(
      caller.draw.reorder({ classId, order: [...order].reverse() }),
    ).rejects.toThrow(/classe è iniziata/);
    await api.db
      .update(schema.runs)
      .set({ status: "attesa" })
      .where(eq(schema.runs.id, anyRun!.id));
  });
});

describe("cut-off self-serve (BR-90) sull'iscrizione", () => {
  it("a ridosso dell'evento il self-serve chiude con un messaggio umano; il parametro si valida", async () => {
    const caller = await api.as(organizerToken);
    // evento che INIZIA OGGI: la vigilia è passata → self-serve chiuso
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = futureDate(1);
    const { eventId: nearEventId } = await caller.events.create({
      organizationId: orgId,
      name: "Show Imminente",
      venue: "Arena",
      startDate: today,
      endDate: tomorrow,
    });
    await caller.events.setStatus({ eventId: nearEventId, status: "annunciato" });
    await caller.events.setStatus({
      eventId: nearEventId,
      status: "iscrizioni_aperte",
    });
    const [pattern] = await api.db.select().from(schema.patterns).limit(1);
    const [category] = await api.db
      .select()
      .from(schema.categories)
      .where(eq(schema.categories.code, "101"));
    const [cls] = await api.db
      .insert(schema.classes)
      .values({
        eventId: nearEventId,
        categoryId: category!.id,
        name: "Classe imminente",
        patternId: pattern!.id,
      })
      .returning();

    const rider = await registerUserWithProfile(
      api,
      "lastminute@example.com",
      "Last Minute",
    );
    const [horse] = await api.db
      .insert(schema.horses)
      .values({ name: "Last Horse", microchip: "380-LM-1", ownerId: rider.personId })
      .returning();
    await expect(
      (await api.as(rider.sessionToken)).entries.create({
        classId: cls!.id,
        horseId: horse!.id,
        riderId: rider.personId,
      }),
    ).rejects.toThrow(/hanno chiuso alle 18:00 .* segreteria/);

    // il parametro è dell'evento e si valida: niente valori senza senso
    await expect(
      caller.events.update({ eventId: nearEventId, entryChangeCutoff: "25:99" }),
    ).rejects.toThrow();
    await expect(
      caller.events.update({ eventId: nearEventId, drawDistanceTarget: 5 }),
    ).rejects.toThrow();
    const ok = await caller.events.update({
      eventId: nearEventId,
      entryChangeCutoff: "20:00",
      drawDistanceTarget: 12,
    });
    expect(ok.updated).toBe(true);
  });
});
