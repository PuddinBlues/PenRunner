import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@penrunner/db";
import {
  ScribeStore,
  type StorageAdapter,
  type SyncPayload,
} from "@penrunner/core";
import {
  futureDate,
  registerUserWithProfile,
  setupApi,
  type TestApi,
} from "./helpers.js";

// ---------------------------------------------------------------------------
// BR-29 estesa (validata col giudice): caso misto multi-giudice — un giudice
// dà score_0 o penalità ≥2 dove gli altri no → review SEMPRE, automatica,
// con nota di sistema che riporta i valori PER GIUDICE (al drag il confronto
// parte già informato) e origine "sistema" distinta dalla hold del giudice.
// ---------------------------------------------------------------------------

class MemoryAdapter implements StorageAdapter {
  snapshot: string | null = null;
  async load() {
    return this.snapshot;
  }
  async save(s: string) {
    this.snapshot = s;
  }
}
const clock = () => new Date().toISOString();

let api: TestApi;
let organizerToken: string;
let judgeAToken: string;
let judgeBToken: string;
let judgeAId: string;
let judgeBId: string;
let classId: string;
let run1Id: string;
let run2Id: string;
let maneuverCount: number;

async function inviteJudge(email: string, fullName: string) {
  const caller = await api.as(organizerToken);
  const [first, ...rest] = fullName.split(" ");
  const { token } = await caller.invite.create({
    eventId: eventIdGlobal,
    role: "giudice",
    person: { firstName: first!, lastName: rest.join(" ") || first!, email },
  });
  const anon = await api.as();
  const accepted = await anon.invite.accept({ token: token! });
  const [p] = await api.db
    .select()
    .from(schema.persons)
    .where(eq(schema.persons.email, email));
  return { sessionToken: accepted.sessionToken, personId: p!.id };
}

let eventIdGlobal: string;

async function closedCardPayload(
  judgeId: string,
  runId: string,
  penaltyAt: Record<number, number>,
): Promise<SyncPayload> {
  const store = await ScribeStore.open(
    new MemoryAdapter(),
    () => crypto.randomUUID(),
    clock,
  );
  const cardId = await store.createCard(runId, judgeId, maneuverCount);
  for (let p = 1; p <= maneuverCount; p++) {
    await store.setQuality(cardId, p, 0);
    if (penaltyAt[p]) await store.setPenalty(cardId, p, penaltyAt[p]!);
  }
  await store.closeCard(cardId);
  return store.buildSyncPayload();
}

beforeAll(async () => {
  api = await setupApi();
  const organizer = await registerUserWithProfile(
    api,
    "club@review.example",
    "Referente",
  );
  organizerToken = organizer.sessionToken;
  let caller = await api.as(organizerToken);
  const { organizationId } = await caller.org.create({ name: "Club Review" });
  const admin = await registerUserWithProfile(api, "staff@review.example", "Staff");
  await api.db
    .update(schema.users)
    .set({ platformAdmin: true })
    .where(eq(schema.users.id, admin.userId));
  await (await api.as(admin.sessionToken)).admin.approveOrganization({
    organizationId,
  });
  caller = await api.as(organizerToken);
  const { eventId } = await caller.events.create({
    organizationId,
    name: "Review Slide",
    venue: "Arena",
    startDate: futureDate(45),
    endDate: futureDate(46),
  });
  eventIdGlobal = eventId;
  const [pattern6] = await api.db
    .select()
    .from(schema.patterns)
    .where(eq(schema.patterns.code, "6"));
  const [category] = await api.db
    .select()
    .from(schema.categories)
    .limit(1);
  const [cls] = await api.db
    .insert(schema.classes)
    .values({
      eventId,
      categoryId: category!.id,
      name: "Open due giudici",
      patternId: pattern6!.id,
      judgesCount: 2,
    })
    .returning();
  classId = cls!.id;
  maneuverCount = (
    await api.db
      .select()
      .from(schema.patternManeuvers)
      .where(eq(schema.patternManeuvers.patternId, pattern6!.id))
  ).length;

  for (let i = 0; i < 2; i++) {
    const [p] = await api.db
      .insert(schema.persons)
      .values({ firstName: "Rider", lastName: `R${i}` })
      .returning();
    const [h] = await api.db
      .insert(schema.horses)
      .values({ name: `Horse R${i}`, microchip: `380-R-${i}`, ownerId: p!.id })
      .returning();
    await api.db
      .insert(schema.entries)
      .values({ classId, horseId: h!.id, riderId: p!.id, status: "confermata" });
  }
  await caller.draw.generate({ classId });
  await caller.draw.publish({ classId });
  const runs = await (await api.as(organizerToken)).scoring.runsByClass({ classId });
  run1Id = runs[0]!.runId;
  run2Id = runs[1]!.runId;

  const a = await inviteJudge("judge.a@review.example", "Judge Alfa");
  const b = await inviteJudge("judge.b@review.example", "Judge Beta");
  judgeAToken = a.sessionToken;
  judgeBToken = b.sessionToken;
  judgeAId = a.personId;
  judgeBId = b.personId;
});

afterAll(async () => {
  await api.close();
});

async function runRow(runId: string) {
  const [r] = await api.db
    .select()
    .from(schema.runs)
    .where(eq(schema.runs.id, runId));
  return r!;
}

describe("trigger automatico del caso misto", () => {
  it("penalità 5 da un giudice, nessuna dall'altro → review di SISTEMA con nota per giudice", async () => {
    const pa = await closedCardPayload(judgeAId, run1Id, {});
    await (await api.as(judgeAToken)).scoring.sync(pa);
    // una sola carta chiusa: nessun confronto possibile, nessuna review
    expect((await runRow(run1Id)).reviewHeldAt).toBeNull();

    const pb = await closedCardPayload(judgeBId, run1Id, { 2: 5 });
    await (await api.as(judgeBToken)).scoring.sync(pb);

    const run = await runRow(run1Id);
    expect(run.reviewHeldAt).not.toBeNull();
    expect(run.reviewSource).toBe("sistema");
    expect(run.reviewPosition).toBe(2);
    // la nota parte già informata: manovra e valori per giudice
    expect(run.reviewNote).toMatch(/Manovra 2/);
    expect(run.reviewNote).toMatch(/Judge Beta: penalità 5/);
    expect(run.reviewNote).toMatch(/Judge Alfa: nessuna/);

    const audit = await api.db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, "run.review.system"));
    expect(audit).toHaveLength(1);
  });

  it("la review blocca la validazione finché non è risolta (gate BR-27/29)", async () => {
    const caller = await api.as(organizerToken);
    await expect(
      caller.scoring.validateRun({ runId: run1Id, acknowledgeMismatch: false }),
    ).rejects.toThrow(/firma|review/);
  });

  it("penalità 1 discordante NON innesca (soglia 0/2/5 del giudice)", async () => {
    const pa = await closedCardPayload(judgeAId, run2Id, { 3: 1 });
    await (await api.as(judgeAToken)).scoring.sync(pa);
    const pb = await closedCardPayload(judgeBId, run2Id, {});
    await (await api.as(judgeBToken)).scoring.sync(pb);
    expect((await runRow(run2Id)).reviewHeldAt).toBeNull();
  });
});

describe("hold manuale: origine GIUDICE con manovra indicata", () => {
  it("l'evento held_for_review porta position e viene etichettato 'giudice'", async () => {
    const store = await ScribeStore.open(
      new MemoryAdapter(),
      () => crypto.randomUUID(),
      clock,
    );
    await store.holdForReview(run2Id, "Back: 4 o 5 passi → −2 o score 0", 6);
    const payload = store.buildSyncPayload();
    await (await api.as(judgeAToken)).scoring.sync(payload);

    const run = await runRow(run2Id);
    expect(run.reviewSource).toBe("giudice");
    expect(run.reviewPosition).toBe(6);
    expect(run.reviewNote).toMatch(/Back/);

    // la vista organizzatore espone origine e manovra (due etichette in UI)
    const caller = await api.as(organizerToken);
    const runs = await caller.scoring.runsByClass({ classId });
    const row = runs.find((r) => r.runId === run2Id)!;
    expect(row.reviewSource).toBe("giudice");
    expect(row.reviewPosition).toBe(6);
  });
});
