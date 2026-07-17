# PenRunner — Handoff tecnico

Documento di passaggio per avviare lo sviluppo in Claude Code. Presuppone la lettura di `CLAUDE.md`. Qui ci sono indicazioni più operative su architettura, traduzione dei prototipi e ordine di lavoro.

## Stato del progetto

Fase di concept completata. Esistono: PRD, identità visiva, sistema tema/tier, data model documentato, e quattro prototipi React funzionanti delle schermate chiave. Niente codice di produzione, niente backend, niente scelte di stack vincolanti. Questo è l'inizio dell'implementazione vera.

## Architettura proposta

Una proposta coerente, non un vincolo. Se hai motivi migliori, cambiala — ma decidi presto e resta coerente.

```
┌─────────────────────────────────────────────┐
│  Client web (React + TS)                      │
│  - Portale pubblico (home, eventi, risultati) │
│  - App organizzatore (eventi, iscrizioni)     │
│  - App scuderia (iscrizione massiva)          │
│  - App scribe/giudice (scoring, OFFLINE-FIRST)│
└───────────────┬─────────────────────────────┘
                │ REST o tRPC
┌───────────────┴─────────────────────────────┐
│  API backend                                  │
│  - Auth & ruoli                               │
│  - CRUD anagrafiche / eventi / iscrizioni     │
│  - Motore scoring (validazione regole)        │
│  - Calcolo derivato: classifica, payout, fee  │
│  - Sync endpoint per scoring offline          │
└───────────────┬─────────────────────────────┘
                │
┌───────────────┴─────────────────────────────┐
│  Postgres (modello relazionale)               │
└─────────────────────────────────────────────┘
```

### Punti architetturali critici

**1. Lo scoring offline-first è il vincolo che plasma l'architettura.** Non trattarlo come una feature da aggiungere. L'app scribe deve:
- compilare la ScoreCard in locale (IndexedDB o simile) senza rete;
- mantenere una coda di score firmati in attesa di sync;
- sincronizzare al rientro della connessione con conflict resolution (last-write-wins per le correzioni tracciate, ma una ScoreCard firmata non dovrebbe essere riscritta silenziosamente — usa un audit log).
Valuta un approccio PWA o un layer di sync dedicato fin dall'inizio.

**2. Classifica, payout e fee sono calcolati, non memorizzati.** Implementali come query/funzioni derivate dai dati di run e iscrizione. Memorizzarli crea disallineamenti quando uno score viene corretto. Se servono per performance, usa viste materializzate invalidate sugli eventi di scoring, mai scrittura manuale.

**3. Le regole di scoring vivono nel backend.** La validazione (range voti, valori penalità ammessi, transizioni di stato della run) deve stare nel motore server, non solo nel client. Il client offline calcola lo score provvisorio per UX, ma il server è la fonte di verità alla sync.

**4. Pattern come catalogo di dominio.** I `Pattern` e le loro `Maneuver` sono dati di riferimento condivisi tra eventi, versionati per stagione. Non duplicarli per evento: la `Class` punta a un `Pattern`.

## Tradurre i prototipi in codice

I quattro file in `prototypes/` sono React funzionante ma prototipale: stato locale con `useState`, dati mock in cima a ogni file, inline style con un oggetto token `C`. Sono la **specifica viva** di UI e comportamento.

Come usarli:
- **Look & comportamento:** riproducili fedelmente. Animazioni, stati vuoti, viraggi di colore, copy — sono tutti decisi.
- **Token visivi:** l'oggetto `C` in cima a ogni prototipo è la palette. È formalizzato in `design/design-tokens.md`. Portalo nel theme (Tailwind config o tema CSS) una volta sola.
- **Dati mock:** gli array `ROSTER`, `EVENTS`, `CLASSES`, `MANEUVERS` ecc. mostrano la forma dei dati attesi. Vanno sostituiti con chiamate API.
- **Logica:** funzioni come il calcolo `totals` (iscrizione e scoring) codificano regole reali — riportale nel motore, non reinventarle.

Cosa NON portare pari pari:
- Lo stato locale va sostituito con data fetching reale e stato server.
- Gli inline style possono diventare classi/componenti, ma mantenendo i token.
- I `setTimeout` che simulano la diretta (in `PaginaEvento.jsx`) vanno sostituiti con aggiornamenti real-time veri (websocket/polling).

## Ordine di lavoro suggerito (MVP)

Per dipendenza, non per appariscenza:

1. **Fondamenta dati.** Schema DB dalle entità del data model. Anagrafiche (Person, Horse, Stable), Event, Class, Pattern, Maneuver. Seed con i pattern della stagione corrente (da validare con un giudice).
2. **Auth e ruoli.** Organizzatore, scuderia, giudice/scribe, pubblico (read-only).
3. **Iscrizione.** Singola e massiva (rif. `IscrizioneMassiva.jsx`). Calcolo fee per cavallo distinto. Stati Entry.
4. **Draw order.** Generazione ordine di partenza per classe.
5. **Scoring offline-first.** (rif. `ScoringGiudice.jsx`) Il pezzo più delicato: motore di scoring, ScoreCard/ManeuverScore, firma, sync, audit log. Validare le regole col giudice prima.
6. **Classifica + portale pubblico.** (rif. `Home.jsx`, `PaginaEvento.jsx`) Calcolo derivato, live results.
7. **Payout e documenti.** Calcolo payout, export PDF start list/results.

Fase 2 (dopo MVP): pagamento intero evento in piattaforma con split della fee; circuiti/campionati con punti cumulativi stagionali; analytics.

## Checklist qualità (dai requisiti non funzionali del PRD)

- Interfaccia in italiano, terminologia IRHA/FISE.
- Live scoring propagato al pubblico entro pochi secondi dalla validazione.
- App scribe funzionante offline con sync senza perdita dati.
- GDPR sui dati anagrafici e di tesseramento; audit log sulle modifiche agli score.
- Responsive: iscrizione e scoring ottimizzati touch; portale pubblico mobile-first.
- Numeri sempre tabulari; accento verde solo su azioni; rosso solo per "in diretta".

## File in questo pacchetto

- `CLAUDE.md` — bussola, letta automaticamente da Claude Code. Inizia da qui.
- `docs/prd.md` — Product Requirements Document completo.
- `docs/data-model.md` — entità, campi, stati, regole di scoring, fee, punti aperti.
- `docs/data-model.html` — stessa cosa come pagina navigabile con diagramma ER.
- `design/design-tokens.md` — palette, tipografia, regole d'uso, sistema tema/tier.
- `design/styleguide.html` — style guide visiva completa e navigabile.
- `prototypes/*.jsx` — i 4 prototipi React funzionanti.
- `reference/` — eventuali asset (foto eventi usate nei prototipi sono segnaposto; in produzione servono immagini con diritti).
