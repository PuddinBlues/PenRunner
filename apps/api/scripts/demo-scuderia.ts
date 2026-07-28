/* eslint-disable no-console */
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "../src/routers/index.js";

// ---------------------------------------------------------------------------
// Ponte temporaneo per il pilota end-to-end: il passo "iscrizione scuderia"
// non ha ancora la sua UI (prossima fase) — questo script fa da scuderia via
// API: roster (2 cavalieri, 3 cavalli) + iscrizione massiva + conferma.
//
// Uso (evento con iscrizioni APERTE):
//   pnpm --filter @penrunner/api demo:scuderia -- email password [nomeEvento]
// ---------------------------------------------------------------------------

const API_URL = process.env.API_URL ?? "http://localhost:3001";
const [email, password, eventName] = process.argv.slice(2);

if (!email || !password) {
  console.error("Uso: demo-scuderia -- <email> <password> [nomeEvento]");
  process.exit(1);
}

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

const anon = client();
const { sessionToken } = await anon.auth.login.mutate({ email: email!, password: password! });
const api = client(sessionToken);

const events = await api.events.mine.query();
const event =
  (eventName ? events.find((e) => e.name === eventName) : undefined) ??
  events.find((e) => e.status === "iscrizioni_aperte") ??
  events[0];
if (!event) throw new Error("Nessun evento trovato: crealo prima dal back-office");
console.log(`Evento: ${event.name} (${event.status})`);

const classes = await api.classes.listByEvent.query({ eventId: event.id });
if (classes.length === 0) throw new Error("L'evento non ha classi: aggiungile dal wizard");

const { stableId } = await api.roster.createStable.mutate({
  name: "Scuderia Demo Pilota",
});
const r1 = await api.roster.addRider.mutate({
  stableId,
  firstName: "Martina", lastName: "Rossi",
  email: "martina.rossi@demo.example",
  birthDate: "1994-05-12",
});
const r2 = await api.roster.addRider.mutate({
  stableId,
  firstName: "Luca", lastName: "Bianchi",
  email: "luca.bianchi@demo.example",
  birthDate: "1988-11-03",
});
const horses = [] as string[];
for (const [i, name] of ["Gun Smoke Whiz", "Spook Chic Dream", "Shiny Little Step"].entries()) {
  const h = await api.roster.addHorse.mutate({
    stableId,
    name,
    microchip: `38027100000090${i}`,
    ownerPersonId: (i % 2 === 0 ? r1 : r2).personId,
  });
  horses.push(h.horseId);
}
console.log(`Roster: 2 cavalieri, ${horses.length} cavalli`);

// Binomi sulla prima classe (stesso cavaliere su 2 cavalli: si vedrà il
// distanziamento del draw, BR-19); un binomio anche sulle altre classi.
const items = [
  { classId: classes[0]!.id, horseId: horses[0]!, riderId: r1.personId },
  { classId: classes[0]!.id, horseId: horses[1]!, riderId: r2.personId },
  { classId: classes[0]!.id, horseId: horses[2]!, riderId: r1.personId },
  ...classes.slice(1).map((c) => ({
    classId: c.id,
    horseId: horses[0]!,
    riderId: r1.personId,
  })),
];
const { entries, quote } = await api.entries.bulkCreate.mutate({ stableId, items });
await api.entries.confirm.mutate({ entryIds: entries.map((e) => e.entryId) });

console.log(`Iscritti e confermati ${entries.length} binomi.`);
for (const e of entries) {
  if (e.warnings.length)
    console.log(`  avvisi (non bloccanti, BR-18): ${e.warnings.map((w) => w.code).join(", ")}`);
}
console.log(
  `Quota scuderia: ${JSON.stringify(quote)} — ora check-in e draw dal back-office.`,
);
