# @penrunner/stable

App scuderia: roster, iscrizione massiva e "le mie iscrizioni" — **mobile-first** (si usa dal telefono, a bordo campo). PWA da solo browser (BR-81): "Aggiungi a Home" facoltativo, **nessun layer dati offline** (dichiarato: l'iscrizione richiede rete; l'offline-first resta un requisito del solo scoring).

## Comandi

```bash
pnpm --filter @penrunner/stable dev     # dev server (Vite) su :5175
pnpm --filter @penrunner/stable build   # build PWA
pnpm --filter @penrunner/stable test    # test (fee 215 €, i18n, copy BR-80)
```

Config: `VITE_API_URL` (default `http://localhost:3001`), `VITE_PORTAL_URL` (default `http://localhost:3000`, link ai risultati live).

## Cosa copre

- **Onboarding self-serve** (BR-80): registrazione → verifica email → login → profilo (claim se esiste) + scuderia in un passo.
- **Roster** con dedup esplicito: email/microchip già registrati **collegano, mai duplicano** — e la UI lo dice. Hint sul claim: il cavaliere si prende il profilo registrandosi con la sua email.
- **Iscrizione massiva** in tre passi: evento (solo iscrizioni aperte, con quota al cavaliere) → griglia binomi (card + chips-classe, **fee live per cavallo distinto**, BR-01; classi piene = capienza che blocca, non eleggibilità) → riepilogo con avvisi **BR-18 mai bloccanti** e totale **confermato dal server** (fa fede quello; il caso 215 € del prototipo è il test).
- **Le mie iscrizioni**: stato per binomio, draw number a draw pubblicato, avvisi in traccia, score dalla classifica pubblica, link ai risultati live.
- **Scratch self-serve** (BR-17): conferma con le tre conseguenze (buco nel draw, fuori classifica/premi, quota dovuta); gate spento o turno passato → messaggi che dicono cosa fare, non errori tecnici.

Condivide tokens, primitivi e i18n da `@penrunner/ui`. Le icone in `public/` sono segnaposto.
