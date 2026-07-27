# @penrunner/db

Fondamenta dati di PenRunner: schema Postgres (Drizzle ORM), migrazioni e seed del catalogo di dominio.

## Comandi

Dal root del repo (Postgres su `localhost:5432`, vedi `docker-compose.yml`):

```bash
docker compose up -d      # Postgres 16 di sviluppo
pnpm db:migrate           # applica le migrazioni (packages/db/drizzle/)
pnpm db:seed              # seed idempotente da reference/ (pattern + categorie 2026)
pnpm test                 # vitest (usa TEST_DATABASE_URL, default penrunner_test)
pnpm db:generate          # rigenera le migrazioni dopo una modifica allo schema
```

Connessioni configurabili con `DATABASE_URL` e `TEST_DATABASE_URL` (vedi `.env.example`).

## Struttura

- `src/schema/` — tabelle per nucleo: `catalog` (pattern, manovre, categorie), `anagrafiche` (stables, persons, horses), `evento` (events, classes), `gara` (entries, runs, score_cards, maneuver_scores). Gli enum e gli stati riprendono alla lettera spec funzionale e data model.
- `src/seed/` — caricamento e validazione di `reference/patterns.json` e `reference/categories.json`, upsert su `(code, season)`. I dati normativi si usano come sono: il seed valida, non corregge.
- `drizzle/` — migrazioni SQL generate (committate).
- `test/` — round-trip del seed (incluso il canarino Pattern 6 = RS, LS, LC, RC, RRB, LRB, SB, verificato su una score card reale) e vincoli di dominio (BR-11, BR-21, BR-22, BR-40, microchip, draw).

## Scelte da conoscere

- **Niente colonne per i valori derivati** (BR-30, BR-50): score di carta, final_score della run, classifica, payout, fee maturata ed ETA non esistono nello schema — si calcolano da entry, run e score card. Alla firma il totale si mostra al giudice ma non si salva: la firma congela gli input.
- Le **penalità di manovra** sono un totale unico per manovra (BR-22): nessun catalogo per tipo.
- `persons.locale` (`it`/`en`, default `it`) guida email e notifiche (BR-62).
- `classes.trot_in_imposed` è la scelta dello show di imporre il trot-in su pattern walk-in (BR-26): sta sulla classe, non sul catalogo pattern.
- Person↔Stable è 1-N (`persons.stable_id`, scuderia principale). La relazione molti-a-molti per cavalieri multi-scuderia — edge citato dalla spec — è rimandata deliberatamente all'iscrizione massiva.
