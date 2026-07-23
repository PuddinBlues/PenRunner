# @penrunner/organizer

Back-office dell'organizzatore: SPA autenticata in registro chiaro, usabile da solo browser (BR-81, niente store). Autonomia self-serve (BR-80): wizard guidato, stati vuoti che indicano il passo successivo, aiuto contestuale a schermo.

## Comandi

```bash
pnpm --filter @penrunner/organizer dev     # dev server (Vite) su :5174
pnpm --filter @penrunner/organizer build   # build statica
pnpm --filter @penrunner/organizer test    # test (i18n parity, componenti)
```

Config: `VITE_API_URL` (default `http://localhost:3001`), `VITE_SCRIBE_URL` (default `http://localhost:5173`, per i link d'invito).

## Cosa copre

- **Ingresso self-serve**: registrazione → verifica email → login → creazione organizzazione (parte in vetting). Un'organizzazione **in verifica prepara l'evento in bozza** (evento + classi + quote); solo annuncio e apertura iscrizioni aspettano l'approvazione — il messaggio lo dice (BR-80).
- **Wizard evento** in 3 passi: dati evento → classi dal catalogo ufficiale (24 categorie, 20 pattern; guard BR-26 sul trot-in) → quote e impostazioni. Quota PenRunner e margine **visibili, mai scrivibili** (BR-02); chirurgia draw read-only (BR-43).
- **Check-in** con avvisi di eleggibilità **mai bloccanti** (BR-18): si vede, si decide, la traccia resta. Scratch con conferma informativa (fee dovuta, BR-17).
- **Draw**: genera con distanziamento (BR-19, default 8, warnings a scala), pubblica (congela e crea le run), start list con marker di drag; **late entry sempre in coda**, spostamenti solo con chirurgia concessa (BR-43).
- **Risultati**: run → carte → **valida** (gate BR-27/29: tutte firmate, niente review, mismatch riconosciuto esplicitamente) → **pubblica classe**; classifica con badge PROVVISORIO/UFFICIALE (BR-42) e payout scomposto (formula da confermare, BR-33).
- **Documenti PDF**: start list, classifica, payout, score card (fetch autenticato).
- **Registro modifiche** event-scoped, read-only (BR-71): trasparenza sulle azioni tracciate del proprio evento.

## Limiti dichiarati

- "Annulla classe" con iscrizioni o draw: rimandato, il messaggio in app lo dichiara (niente buchi silenziosi).
- L'approvazione del vetting è del Platform Admin (back-office BR-72/73, fase successiva): in sviluppo si usa `admin.approveOrganization` via API.
