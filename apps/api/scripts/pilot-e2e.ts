/* eslint-disable no-console */
// Copione del PILOTA end-to-end contro l'API viva: replica passo-passo la
// ricetta dal browser (organizzatore → scuderia → draw → scribe → risultati
// → payout → PDF). Verifica di collaudo, non parte del prodotto.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { ScribeStore, type StorageAdapter } from "@penrunner/core";
import { createDb, schema } from "@penrunner/db";
import { eq, sql as dsql } from "drizzle-orm";
import type { AppRouter } from "../src/routers/index.js";

const API_URL = process.env.API_URL ?? "http://localhost:3001";
const LOG = process.env.MAIL_LOG!;

function client(token?: string) {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${API_URL}/trpc`,
        headers: () => (token ? { authorization: `Bearer ${token}` } : {}),
      }),
    ],
  });
}

function mailTokenFor(email: string): string {
  const log = readFileSync(LOG, "utf8");
  const blocks = log.split("[mail] a ").filter((b) => b.startsWith(email));
  const last = blocks.at(-1);
  const m = last?.match(/token: (\S+)/);
  if (!m) throw new Error(`Nessun token in log per ${email}`);
  return m[1]!;
}

async function registerVerified(email: string, password: string) {
  const anon = client();
  await anon.auth.register.mutate({ email, password });
  await anon.auth.verifyEmail.mutate({ token: mailTokenFor(email) });
  const { sessionToken } = await anon.auth.login.mutate({ email, password });
  return sessionToken;
}

const step = (n: string) => console.log(`\n=== ${n}`);

// 1. Organizzatore self-serve: registra, verifica, profilo, organizzazione.
step("1. Organizzatore: registrazione → verifica email → organizzazione");
const orgEmail = "organizer@pilot.example";
const orgPassword = "password-pilota";
let orgToken = await registerVerified(orgEmail, orgPassword);
let organizer = client(orgToken);
await organizer.profile.create.mutate({ fullName: "Referente Pilota" });
const { organizationId } = await organizer.org.create.mutate({
  name: "Reining Club Pilota",
});
console.log(`organizzazione ${organizationId} (in verifica)`);

// 2. Preparazione in BOZZA senza vetting (BR-80).
step("2. Evento in bozza + classi dal catalogo (senza vetting)");
const catalogCategories = await organizer.catalog.categories.query();
const catalogPatterns = await organizer.catalog.patterns.query();
const { eventId } = await organizer.events.create.mutate({
  organizationId,
  name: "Pilot Slide 2026",
  venue: "Arena Pilota",
  startDate: "2026-09-05",
  endDate: "2026-09-06",
  tier: "nazionale",
  feePerHorse: "15",
});
const cat = catalogCategories[0]!;
const pat = catalogPatterns.find((p) => p.code === "6")!;
const { classId } = await organizer.classes.create.mutate({
  eventId,
  categoryId: cat.id,
  patternId: pat.id,
  name: "Open Pilota",
  entryFee: "120",
  addedMoney: "500",
  trophyCost: "0",
  judgesCount: 1,
});
console.log(`evento ${eventId}, classe ${classId} (Pattern 6, ${pat.maneuversCount} manovre)`);
const blocked = await organizer.events.setStatus
  .mutate({ eventId, status: "annunciato" })
  .then(() => false)
  .catch((e: Error) => e.message.includes("in verifica"));
if (!blocked) throw new Error("il gate del vetting doveva bloccare l'annuncio");
console.log("annuncio bloccato come atteso: organizzazione in verifica");

// 3. Vetting: admin approva (in dev il flag admin si dà a mano nel DB).
step("3. Platform Admin: approvazione vetting");
const adminEmail = "staff@pilot.example";
const adminToken = await registerVerified(adminEmail, orgPassword);
const { db, pool } = createDb();
await db
  .update(schema.users)
  .set({ platformAdmin: true })
  .where(dsql`lower(${schema.users.email}) = ${adminEmail}`);
const admin = client(adminToken);
await admin.admin.approveOrganization.mutate({ organizationId });
console.log("organizzazione verificata");

// 4. Pubblicazione: annuncio → iscrizioni aperte.
step("4. Annuncio e apertura iscrizioni");
organizer = client(orgToken);
await organizer.events.setStatus.mutate({ eventId, status: "annunciato" });
await organizer.events.setStatus.mutate({ eventId, status: "iscrizioni_aperte" });
console.log("iscrizioni aperte");

// 5. Scuderia (ponte: lo script demo, in attesa della UI scuderia).
step("5. Scuderia: roster + iscrizione massiva (demo:scuderia)");
console.log(
  execFileSync("npx", ["tsx", "scripts/demo-scuderia.ts", orgEmail, orgPassword], {
    encoding: "utf8",
  }),
);

// 6. Check-in con avvisi mai bloccanti (BR-18).
step("6. Check-in");
const entries = await organizer.entries.listByClass.query({ classId });
for (const e of entries) {
  if (e.status === "confermata") {
    console.log(
      `  check-in ${e.id.slice(0, 8)} — avvisi: ${(e.liveWarnings as unknown[]).length} (non bloccano)`,
    );
    await organizer.entries.checkIn.mutate({ entryId: e.id });
  }
}

// 7. Draw: genera (BR-19) e pubblica (crea le run).
step("7. Draw");
const draw = await organizer.draw.generate.mutate({ classId, minRiderGap: 8 });
console.log(
  `  ordine di ${draw.order.length}, gap ottenuto ${draw.achievedGap} (target ${draw.targetGap}), avvisi ${draw.warnings.length}`,
);
await organizer.draw.publish.mutate({ classId });
const startList = await organizer.draw.startList.query({ classId });
console.log(
  `  start list pubblicata: ${startList.entries.map((e) => `${e.drawNumber}.${e.horseName}`).join(" · ")}`,
);

// 8. Invito giudice: il token torna all'organizzatore (link a mano).
step("8. Invito giudice con link visibile");
const invite = await organizer.invite.create.mutate({
  eventId,
  role: "giudice",
  person: { fullName: "Judge Pilota", email: "judge@pilot.example" },
});
console.log(`  link scribe: http://localhost:5173/?token=${invite.token!.slice(0, 8)}…`);

// 9. Scribe: accetta, scarica il bundle, segna offline, chiude e firma, sync.
step("9. Scoring dallo scribe (store offline reale + sync idempotente)");
const anon = client();
const scribeSession = await anon.invite.accept.mutate({ token: invite.token! });
const scribe = client(scribeSession.sessionToken);
const bundle = await scribe.scoring.bundle.query({ eventId });
const judgeId = bundle.judges[0]!.personId;
const maneuvers = bundle.maneuvers.filter((m) => m.patternId === pat.id);
const memory: Record<string, string> = {};
const adapter: StorageAdapter = {
  async load() {
    return memory.snap ?? null;
  },
  async save(s: string) {
    memory.snap = s;
  },
};
const store = await ScribeStore.open(
  adapter,
  () => crypto.randomUUID(),
  () => new Date().toISOString(),
);
const qualities = [0.5, 0, -0.5, 1, 0, 0.5, -1, 0];
for (const [i, run] of bundle.runs.entries()) {
  await store.sendToField(run.id);
  const cardId = await store.createCard(run.id, judgeId, maneuvers.length);
  for (const m of maneuvers) {
    await store.setQuality(cardId, m.position, qualities[(i + m.position) % qualities.length]!);
  }
  if (i === 1) await store.setPenalty(cardId, 2, 1); // penalità totale unico (BR-22)
  const closure = await store.closeCard(cardId);
  console.log(`  run ${i + 1}: chiusa con totale ${closure.breakdown.total}`);
}
// firma in batch di TUTTE le carte chiuse (BR-27)
const closedIds = bundle.runs
  .map((r) => store.cardForRun(r.id, judgeId)!.clientCardId);
await store.signBatch(closedIds.map((clientCardId) => ({ clientCardId, signatureStroke: "M0,0L10,10" })));
const payload = store.buildSyncPayload();
const syncRes = await scribe.scoring.sync.mutate(payload);
console.log(
  `  sync: ${syncRes.cards.filter((c) => c.result === "applied").length}/${payload.cards.length} carte applicate`,
);

// 10. Validazione (gate BR-27) e pubblicazione classe.
step("10. Validazione e pubblicazione risultati");
const runs = await organizer.scoring.runsByClass.query({ classId });
for (const r of runs) {
  await organizer.scoring.validateRun.mutate({ runId: r.runId, acknowledgeMismatch: false });
}
const pub = await organizer.scoring.publishClass.mutate({ classId });
console.log(`  pubblicate ${pub.published} run, avvisi ${pub.warnings.length}`);

// 11. Classifica e payout derivati.
step("11. Classifica e payout (derivati, mai memorizzati)");
const ranking = await organizer.live.classRanking.query({ classId });
for (const row of ranking.ranking) {
  console.log(`  ${row.position}. ${row.horseName} · ${row.riderName} — ${row.total}`);
}
console.log(`  stato: ${ranking.official ? "UFFICIALE" : "PROVVISORIO (BR-42, +30')"}`);
const payout = await organizer.payout.classPayout.query({ classId });
console.log(
  `  purse ${(payout.purse.purseCents / 100).toFixed(2)} € · ${payout.placesPaid} piazzamenti · quadratura: ${payout.distributedCents + payout.undistributedCents === payout.purse.purseCents}`,
);

// 12. PDF.
step("12. Documenti PDF");
for (const doc of ["start-list", "results", "payout"]) {
  const res = await fetch(`${API_URL}/documents/class/${classId}/${doc}.pdf`, {
    headers: { authorization: `Bearer ${orgToken}` },
  });
  const buf = Buffer.from(await res.arrayBuffer());
  console.log(`  ${doc}.pdf → ${res.status}, ${buf.length} byte, ${buf.subarray(0, 4).toString()}`);
}
const sc = await fetch(
  `${API_URL}/documents/run/${runs[0]!.runId}/scorecard/${judgeId}.pdf`,
  { headers: { authorization: `Bearer ${orgToken}` } },
);
console.log(`  scorecard.pdf → ${sc.status}, ${Buffer.from(await sc.arrayBuffer()).length} byte`);

await pool.end();
console.log("\nPILOTA COMPLETO: ciclo gara end-to-end verde.");
