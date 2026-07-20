# PenRunner — Pacchetto di progetto

Tutto il necessario per avviare lo sviluppo di PenRunner in Claude Code.

## Da dove partire

1. **`CLAUDE.md`** — leggilo per primo. È la bussola: cos'è il prodotto, stack consigliato, regole di prodotto da non violare, sistema visivo, modello dati in breve. Claude Code lo legge automaticamente all'apertura del progetto.
2. **`docs/spec-funzionale.html`** — la fonte di verità sul comportamento: ruoli e permessi, onboarding, tutti i flussi end-to-end con edge case e stati di errore, macchine a stati, catalogo regole di business (BR). È il documento più denso: leggilo presto.
3. **`docs/handoff-tecnico.md`** — architettura, come tradurre i prototipi, ordine di lavoro per l'MVP.

## Sviluppo

Monorepo pnpm (Node ≥ 22). Stato: **step 6 dell'MVP — classifica live, ETA, portale pubblico**.

- `packages/core` — motore scoring versionato + `computeRanking`/`computeEta`/ufficialità (puri, testati).
- `apps/api` — Fastify + tRPC: auth, iscrizioni/fee, draw, scoring offline-first, viste derivate live (`live.eventLive`/`classRanking`/`classEta`), publishClass, propagazione BR-41, SSE `/live/:eventId`.
- `apps/web` — **portale pubblico Next.js** (App Router, SSR): calendario, pagina evento live, start list con ETA e marker drag, pagina pattern (passi testuali), scoreboard kiosk. i18n it/en dal primo componente, percorsi `/it/` `/en/` (BR-60..62).

- `packages/db` — schema Postgres (Drizzle), migrazioni, seed del catalogo 2026.
- `apps/api` — API Fastify + tRPC: auth con verifica email e claim, organizzazioni con vetting, inviti event-scoped, back-office admin con audit immutabile (BR-70/71), policy della matrice ruoli; roster scuderia con dedup (microchip/email) e membership multi-scuderia, iscrizione singola e massiva con avvisi di eleggibilità mai bloccanti (BR-18), scratch (BR-17), fee derivate con revenue split discrezionale (BR-01/02/03).

```bash
pnpm install
docker compose up -d      # Postgres 16 di sviluppo
pnpm db:migrate && pnpm db:seed
pnpm test                 # test di tutti i workspace
pnpm --filter @penrunner/api dev   # API su :3001
pnpm --filter @penrunner/web dev   # portale su :3000
```

Dettagli in `packages/db/README.md`.

## Struttura

```
penrunner-handoff/
├── CLAUDE.md                  ← bussola, inizia da qui
├── docs/
│   ├── handoff-tecnico.md     ← architettura e piano di lavoro
│   ├── prd.md                 ← Product Requirements completo
│   ├── spec-funzionale.html   ← comportamento: ruoli, onboarding, flussi, edge case, stati, regole BR
│   ├── data-model.md          ← entità, stati, scoring, fee (markdown)
│   └── data-model.html        ← stesso, navigabile, con diagramma ER
├── design/
│   ├── design-tokens.md       ← palette e regole d'uso, pronte all'uso
│   └── styleguide.html        ← style guide visiva completa
├── prototypes/                ← 4 prototipi React funzionanti (riferimento UI)
│   ├── Home.jsx
│   ├── PaginaEvento.jsx
│   ├── IscrizioneMassiva.jsx
│   └── ScoringGiudice.jsx
└── reference/
    └── README.md              ← note su immagini e seed pattern
```

## In una frase

PenRunner è un gestionale per gare di reining (IRHA/FISE Italia): l'organizzatore crea l'evento, le scuderie iscrivono i binomi, i giudici danno i punteggi in campo (anche offline), il pubblico segue i risultati live. Gratis per tutti, con una fee per cavallo iscritto.

## Tre cose da non sbagliare

1. **Scoring:** parte da 70, le penalità di manovra sono un totale inserito a mano dallo scribe (niente cataloghi). Vedi `CLAUDE.md` → regole di prodotto.
2. **Offline-first** per lo scoring giudice: è un vincolo architetturale, non una feature da aggiungere dopo.
3. **Classifica, payout e fee sono calcolati**, non memorizzati.
