# @penrunner/scribe

App scribe/giudice: scoring in arena, **offline-first**, PWA usabile da solo browser (BR-81). È la vestizione UI del `ScribeStore` e del motore di `@penrunner/core` (già testati allo step 5): collega l'interfaccia alla logica, non la reinventa.

## Comandi

```bash
pnpm --filter @penrunner/scribe dev        # dev server (Vite) su :5173
pnpm --filter @penrunner/scribe build      # build PWA (service worker + manifest)
pnpm --filter @penrunner/scribe test       # test (adapter IndexedDB, i18n, wiring scoring)
```

Config: `VITE_API_URL` (default `http://localhost:3001`) per l'API.

## Architettura

- **Offline-first**: `ScribeStore` (`@penrunner/core`) su IndexedDB via `StorageAdapter`. Write-ahead: ogni tap persiste prima di confermare; la coda sopravvive al crash. `navigator.storage.persist()` chiede storage durevole.
- **Ingresso**: magic link → `invite.accept` → sessione scoped → download `scoring.bundle` (start list, pattern, giudici) in IndexedDB → lavoro anche senza rete.
- **Chiusura ≠ firma** (BR-27): la chiusura per-run mostra il totale e sincronizza come provvisorio (annuncio); la firma è in batch a fine classe (cattura grafometrica), poi immutabile. Riapertura tracciata solo pre-firma.
- **Score in review** (BR-29): il giudice trattiene con una nota del dubbio; la carta resta aperta, viaggia l'evento.
- **Sync**: idempotente (client_card_id), automatico a rete/periodico; conflitti e mismatch restano visibili all'organizzatore, non ricicliamo.

## Come provarla

1. API in esecuzione (`pnpm --filter @penrunner/api dev`) e un evento con classe, draw pubblicato e un invito giudice/scribe creato (il token arriva via mailer di sviluppo, che lo logga).
2. `pnpm --filter @penrunner/scribe dev`, apri `http://localhost:5173/?token=<TOKEN>` sul tablet (stesso Wi-Fi; imposta `VITE_API_URL` all'IP della macchina API).
3. "Aggiungi a Home" è opzionale (schermo intero); l'app funziona già da browser, anche staccando la rete dopo il primo caricamento.

Le icone in `public/` sono segnaposto; le definitive arriveranno come asset.
