import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@penrunner/db";
import { extractToken } from "../src/services/mailer.js";
import {
  registerUserWithProfile,
  setupApi,
  type TestApi,
} from "./helpers.js";

// ---------------------------------------------------------------------------
// Aggiunta per lo scribe: il bundle include i giudici assegnati (selezione
// giudice). Carte di giudici diversi finiscono su slot (run, judge) distinti.
// ---------------------------------------------------------------------------

let api: TestApi;
let eventId: string;
let classId: string;
let scribeToken: string;
let runId: string;
let judgeAId: string;
let judgeBId: string;

function card(clientCardId: string, judgeId: string) {
  return {
    clientCardId,
    runId,
    judgeId,
    maneuvers: Array.from({ length: 7 }, (_, i) => ({
      position: i + 1,
      quality: 0,
      penalty: 0,
    })),
    runPenalty: 0,
    special: null,
    status: "chiusa" as const,
    closedAt: new Date().toISOString(),
    displayedTotal: 70,
    engineVersion: "1.0.0",
    signedAt: null,
    signatureStroke: null,
  };
}

beforeAll(async () => {
  api = await setupApi();
  const organizer = await registerUserWithProfile(api, "club@example.com", "Club");
  let caller = await api.as(organizer.sessionToken);
  const { organizationId } = await caller.org.create({ name: "Club Bundle" });
  const admin = await registerUserWithProfile(api, "staff@penrunner.example", "Staff");
  await api.db
    .update(schema.users)
    .set({ platformAdmin: true })
    .where(eq(schema.users.id, admin.userId));
  await (await api.as(admin.sessionToken)).admin.approveOrganization({ organizationId });

  caller = await api.as(organizer.sessionToken);
  ({ eventId } = await caller.events.create({
    organizationId,
    name: "Bundle Slide 2026",
    venue: "Arena",
    startDate: "2026-09-25",
    endDate: "2026-09-26",
  }));
  const [pattern6] = await api.db
    .select()
    .from(schema.patterns)
    .where(eq(schema.patterns.code, "6"));
  const [category] = await api.db
    .select()
    .from(schema.categories)
    .where(eq(schema.categories.code, "101"));
  const [cls] = await api.db
    .insert(schema.classes)
    .values({ eventId, categoryId: category!.id, name: "Open", patternId: pattern6!.id })
    .returning();
  classId = cls!.id;
  const [p] = await api.db.insert(schema.persons).values({ fullName: "Rider" }).returning();
  const [h] = await api.db
    .insert(schema.horses)
    .values({ name: "Horse", microchip: "380-BND-1", ownerId: p!.id })
    .returning();
  await api.db
    .insert(schema.entries)
    .values({ classId, horseId: h!.id, riderId: p!.id, status: "confermata" });
  await caller.draw.generate({ classId });
  await caller.draw.publish({ classId });
  const [runRow] = await api.db
    .select()
    .from(schema.runs)
    .innerJoin(schema.entries, eq(schema.entries.id, schema.runs.entryId))
    .where(eq(schema.entries.classId, classId));
  runId = runRow!.runs.id;

  // due giudici assegnati + uno scribe che li serve entrambi
  for (const [name, email] of [
    ["Judge A", "ja@example.com"],
    ["Judge B", "jb@example.com"],
  ]) {
    await caller.invite.create({ eventId, role: "giudice", person: { fullName: name!, email: email! } });
  }
  judgeAId = (await api.db.select().from(schema.persons).where(eq(schema.persons.email, "ja@example.com")))[0]!.id;
  judgeBId = (await api.db.select().from(schema.persons).where(eq(schema.persons.email, "jb@example.com")))[0]!.id;

  await caller.invite.create({
    eventId,
    role: "scribe",
    person: { fullName: "Scribe", email: "scr@example.com" },
  });
  const scribeInvite = extractToken(api.mailer.lastTo("scr@example.com")!);
  const accepted = await (await api.as()).invite.accept({ token: scribeInvite });
  scribeToken = accepted.sessionToken;
});

afterAll(async () => {
  await api.close();
});

describe("bundle coi giudici (selezione giudice per lo scribe)", () => {
  it("il bundle elenca i giudici assegnati", async () => {
    const scribe = await api.as(scribeToken);
    const bundle = await scribe.scoring.bundle({ eventId });
    expect(bundle.judges.map((j) => j.personId).sort()).toEqual(
      [judgeAId, judgeBId].sort(),
    );
    expect(bundle.selfJudgePersonId).toBeNull(); // è uno scribe, non un giudice
    expect(bundle.classes).toHaveLength(1);
  });

  it("carte di giudici diversi → slot (run, judge) distinti, nessun conflitto", async () => {
    const scribe = await api.as(scribeToken);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await scribe.scoring.sync({
      engineVersion: "1.0.0",
      cards: [
        card("00000000-0000-4000-8000-00000000aa01", judgeAId),
        card("00000000-0000-4000-8000-00000000bb02", judgeBId),
      ],
      events: [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    expect(res.cards.every((c: { result: string }) => c.result === "applied")).toBe(true);
    const cards = await api.db
      .select()
      .from(schema.scoreCards)
      .where(eq(schema.scoreCards.runId, runId));
    expect(cards).toHaveLength(2);
    expect(cards.map((c) => c.judgeId).sort()).toEqual([judgeAId, judgeBId].sort());
  });
});
