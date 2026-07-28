import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@penrunner/db";
import { liveBus } from "../src/services/livebus.js";
import { extractToken } from "../src/services/mailer.js";
import {
  registerUserWithProfile,
  setupApi,
  type TestApi,
} from "./helpers.js";

// ---------------------------------------------------------------------------
// Step 6: classifica derivata live, ETA, fine go, pubblicazione, finestra
// BR-42, propagazione BR-41 con notifiche nella lingua del destinatario,
// tick del bus live.
// ---------------------------------------------------------------------------

let api: TestApi;
let organizerToken: string;
let judgeSessionToken: string;
let judgeId: string;
let eventId: string;
let classId: string;
const runByDraw = new Map<number, string>();
const entryByDraw = new Map<number, string>();
const ticks: string[] = [];

function card(
  clientCardId: string,
  runId: string,
  opts: { q1?: number; signedAt?: string | null; displayedTotal?: number } = {},
) {
  const q1 = opts.q1 ?? 0;
  return {
    clientCardId,
    runId,
    judgeId,
    maneuvers: Array.from({ length: 7 }, (_, i) => ({
      position: i + 1,
      quality: i === 0 ? q1 : 0,
      penalty: 0,
    })),
    runPenalty: 0,
    special: null,
    status: (opts.signedAt ? "firmata" : "chiusa") as "chiusa" | "firmata",
    closedAt: new Date().toISOString(),
    displayedTotal: opts.displayedTotal ?? 70 + q1,
    engineVersion: "1.0.0",
    signedAt: opts.signedAt ?? null,
    signatureStroke: null,
  };
}

async function judgeSync(cards: unknown[], events: unknown[] = []) {
  const judge = await api.as(judgeSessionToken);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return judge.scoring.sync({ engineVersion: "1.0.0", cards, events } as any);
}

beforeAll(async () => {
  api = await setupApi();
  liveBus.on("tick", (t: { reason: string }) => ticks.push(t.reason));

  const organizer = await registerUserWithProfile(
    api,
    "club@example.com",
    "Referente Club",
  );
  organizerToken = organizer.sessionToken;
  let caller = await api.as(organizerToken);
  const { organizationId } = await caller.org.create({ name: "Club Live" });
  const admin = await registerUserWithProfile(
    api,
    "staff@penrunner.example",
    "Staff",
  );
  await api.db
    .update(schema.users)
    .set({ platformAdmin: true })
    .where(eq(schema.users.id, admin.userId));
  await (await api.as(admin.sessionToken)).admin.approveOrganization({
    organizationId,
  });
  caller = await api.as(organizerToken);
  ({ eventId } = await caller.events.create({
    organizationId,
    name: "Live Slide 2026",
    venue: "Arena",
    startDate: "2026-09-10",
    endDate: "2026-09-11",
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
    .values({
      eventId,
      categoryId: category!.id,
      name: "Open live",
      patternId: pattern6!.id,
      scheduledOrder: 1,
    })
    .returning();
  classId = cls!.id;

  const locales: Array<"it" | "en"> = ["it", "en", "it"];
  for (let i = 0; i < 3; i++) {
    const [p] = await api.db
      .insert(schema.persons)
      .values({
        firstName: "Rider", lastName: `L${i}`,
        email: `riderl${i}@example.com`,
        locale: locales[i]!,
      })
      .returning();
    const [h] = await api.db
      .insert(schema.horses)
      .values({ name: `Horse L${i}`, microchip: `380-L-${i}`, ownerId: p!.id })
      .returning();
    await api.db
      .insert(schema.entries)
      .values({ classId, horseId: h!.id, riderId: p!.id, status: "confermata" });
  }
  await caller.draw.generate({ classId });
  await caller.draw.publish({ classId });
  const rows = await api.db
    .select({ run: schema.runs, entry: schema.entries })
    .from(schema.runs)
    .innerJoin(schema.entries, eq(schema.entries.id, schema.runs.entryId))
    .where(eq(schema.entries.classId, classId));
  for (const r of rows) {
    runByDraw.set(r.entry.drawNumber!, r.run.id);
    entryByDraw.set(r.entry.drawNumber!, r.entry.id);
  }

  await caller.invite.create({
    eventId,
    role: "giudice",
    person: { firstName: "Live", lastName: "Judge", email: "livejudge@example.com" },
  });
  const inviteToken = extractToken(api.mailer.lastTo("livejudge@example.com")!);
  const accepted = await (await api.as()).invite.accept({ token: inviteToken });
  judgeSessionToken = accepted.sessionToken;
  const [j] = await api.db
    .select()
    .from(schema.persons)
    .where(eq(schema.persons.email, "livejudge@example.com"));
  judgeId = j!.id;
});

afterAll(async () => {
  await api.close();
});

describe("vista live (pagina evento = scoreboard)", () => {
  it("prima dello scoring: nessuna àncora → ETA 'da programma', tutto pending", async () => {
    const anon = await api.as();
    const live = await anon.live.eventLive({ eventId });
    expect(live.focus).not.toBeNull();
    expect(live.focus!.inField).toBeNull();
    expect(live.focus!.nextUp).toHaveLength(3);
    expect(live.focus!.nextUp.every((n) => n.mode === "schedule")).toBe(true);
    expect(live.focus!.ranking.every((r) => r.state === "pending")).toBe(true);
    expect(live.event.sponsorName).toBeNull(); // il posto della fascia è pronto
  });

  it("chiusura della prima run: 'precedente' col provvisorio, ETA live, tick emesso", async () => {
    const ticksBefore = ticks.length;
    await judgeSync(
      [card("00000000-0000-4000-8000-ee0000000001", runByDraw.get(1)!, { q1: 0.5 })],
      [
        {
          clientEventId: "sf-1",
          runId: runByDraw.get(1)!,
          type: "sent_to_field",
          at: new Date().toISOString(),
        },
      ],
    );
    expect(ticks.length).toBeGreaterThan(ticksBefore); // il bus ha spinto

    const anon = await api.as();
    const live = await anon.live.eventLive({ eventId });
    expect(live.focus!.previous).toMatchObject({
      drawNumber: 1,
      total: 70.5,
      provisional: true,
    });
    expect(live.focus!.leader).toMatchObject({ total: 70.5, position: 1 });
    expect(live.focus!.nextUp[0]).toMatchObject({ drawNumber: 2, mode: "live" });
    expect(live.focus!.nextUp[0]!.etaMs).not.toBeNull();
    expect(live.focus!.goComplete).toBe(false);
  });

  it("fine go automatica: ultima run chiusa → classifica del go (flusso G)", async () => {
    await judgeSync([
      card("00000000-0000-4000-8000-ee0000000002", runByDraw.get(2)!, { q1: 1 }),
      card("00000000-0000-4000-8000-ee0000000003", runByDraw.get(3)!, { q1: -0.5 }),
    ]);
    const anon = await api.as();
    const live = await anon.live.eventLive({ eventId });
    expect(live.focus!.goComplete).toBe(true);
    const ranking = await anon.live.classRanking({ classId });
    expect(ranking.goComplete).toBe(true);
    expect(
      ranking.ranking.map((r) => [r.drawNumber, r.position, r.total]),
    ).toEqual([
      [2, 1, 71],
      [1, 2, 70.5],
      [3, 3, 69.5],
    ]);
    expect(ranking.official).toBe(false); // provvisoria (BR-42)
  });
});

describe("pubblicazione e finestra BR-42 (sezione ≈ classe)", () => {
  it("publishClass: le run non firmate NON bloccano — avviso, resta provvisoria", async () => {
    const caller = await api.as(organizerToken);
    const res = await caller.scoring.publishClass({ classId });
    expect(res.published).toBe(0);
    expect(res.warnings).toHaveLength(3); // carte chiuse ma non firmate
  });

  it("dopo la firma: pubblicate; ufficiale solo a +30' dall'ultima run", async () => {
    // firma delle tre carte (update via sync)
    await judgeSync([
      card("00000000-0000-4000-8000-ee0000000001", runByDraw.get(1)!, {
        q1: 0.5,
        signedAt: new Date().toISOString(),
      }),
      card("00000000-0000-4000-8000-ee0000000002", runByDraw.get(2)!, {
        q1: 1,
        signedAt: new Date().toISOString(),
      }),
      card("00000000-0000-4000-8000-ee0000000003", runByDraw.get(3)!, {
        q1: -0.5,
        signedAt: new Date().toISOString(),
      }),
    ]);
    const caller = await api.as(organizerToken);
    const res = await caller.scoring.publishClass({ classId });
    expect(res.published).toBe(3);
    expect(res.warnings).toHaveLength(0);

    const anon = await api.as();
    let ranking = await anon.live.classRanking({ classId });
    expect(ranking.official).toBe(false); // entro la finestra dei 30'
    expect(ranking.officialAt).not.toBeNull();

    // il tempo passa: retrodatiamo la chiusura dell'ultima run di 31'
    await api.db
      .update(schema.scoreCards)
      .set({ closedAt: new Date(Date.now() - 31 * 60_000) });
    ranking = await anon.live.classRanking({ classId });
    expect(ranking.official).toBe(true);
    expect(ranking.ranking.every((r) => !r.provisional)).toBe(true);
  });
});

describe("propagazione BR-41 e BR-31 precisata", () => {
  it("correzione che cambia le posizioni → notifiche nella lingua del destinatario", async () => {
    const mailsBefore = api.mailer.sent.length;
    // il draw 3 (69.5) viene corretto a 71.5: scavalca tutti
    const [cardRow] = await api.db
      .select()
      .from(schema.scoreCards)
      .where(eq(schema.scoreCards.clientCardId, "00000000-0000-4000-8000-ee0000000003"));
    const caller = await api.as(organizerToken);
    const res = await caller.scoring.correct({
      scoreCardId: cardRow!.id,
      maneuvers: Array.from({ length: 7 }, (_, i) => ({
        position: i + 1,
        quality: i === 0 ? 1.5 : 0,
        penalty: 0,
      })),
      reason: "Errore di trascrizione del voto sulla prima manovra",
    });
    expect(res.positionsChanged).toBe(3); // tutti si spostano

    const sent = api.mailer.sent.slice(mailsBefore);
    expect(sent.length).toBe(3);
    // lingua del destinatario (BR-62): rider L1 è 'en', gli altri 'it'
    const english = sent.find((m) => m.to === "riderl1@example.com")!;
    expect(english.subject).toMatch(/Score corrected/);
    const italian = sent.find((m) => m.to === "riderl0@example.com")!;
    expect(italian.subject).toMatch(/Score corretto/);
  });

  it("score_0 in classifica in fondo ma MAI prize-eligible (BR-31)", async () => {
    const [cardRow] = await api.db
      .select()
      .from(schema.scoreCards)
      .where(eq(schema.scoreCards.clientCardId, "00000000-0000-4000-8000-ee0000000002"));
    const caller = await api.as(organizerToken);
    await caller.scoring.correct({
      scoreCardId: cardRow!.id,
      special: "score_0",
      reason: "Fuori pattern rilevato alla review video",
    });
    const anon = await api.as();
    const ranking = await anon.live.classRanking({ classId });
    const zero = ranking.ranking.find((r) => r.drawNumber === 2)!;
    expect(zero.position).toBe(3); // in fondo, ma presente
    expect(zero.outcome).toBe("score_0");
    expect(zero.prizeEligible).toBe(false);
    expect(
      ranking.ranking.filter((r) => r.outcome === "scored").every((r) => r.prizeEligible),
    ).toBe(true);
  });

  it("pari merito al 1° posto: posizioni condivise e flag per la risoluzione umana", async () => {
    // il draw 1 (70.5) viene corretto a 71.5: pari col draw 3
    const [cardRow] = await api.db
      .select()
      .from(schema.scoreCards)
      .where(eq(schema.scoreCards.clientCardId, "00000000-0000-4000-8000-ee0000000001"));
    const caller = await api.as(organizerToken);
    await caller.scoring.correct({
      scoreCardId: cardRow!.id,
      maneuvers: Array.from({ length: 7 }, (_, i) => ({
        position: i + 1,
        quality: i === 0 ? 1.5 : 0,
        penalty: 0,
      })),
      reason: "Ricalcolo dopo review",
    });
    const anon = await api.as();
    const ranking = await anon.live.classRanking({ classId });
    expect(ranking.firstPlaceTie).toBe(true); // run-off / co-champion: umano
    const tied = ranking.ranking.filter((r) => r.position === 1);
    expect(tied).toHaveLength(2);
    expect(tied.every((r) => r.sharedPosition)).toBe(true);
  });
});
