# Censimento qualità frontend — Fase 0

**Data:** 2026-07-28 · **Metodo:** build di PRODUZIONE locali (Vite build + preview per le 3 SPA, Next build + start per il portale, API + Postgres seedati), funnel percorsi con Playwright/Chromium, 47 screenshot (selezione in `screenshots/`, set completo in artefatto di sessione), scanner automatico del testo pagina (regex su `BR-\d+`, codici tRPC, JSON, enum) a ogni passo. Evento "pilota" con score veri per portale e risultati; evento "censimento" creato da zero per i funnel. **Nessun fix in questa fase.**

Viewport: stable **mobile 390×844** e **desktop 1440×900**; organizer desktop; scribe 820×1180; portale desktop + mobile.

---

## TOP 10 per gravità — con proposta d'ordine per la Fase 1

| # | Reperto | Evidenza | Fase 1 |
|---|---------|----------|--------|
| 1 | **Chip coi codici BR, mute** in "Le mie iscrizioni": BR-10, BR-10, BR-13 senza testo né azione — il codice interno della spec mostrato all'utente finale. (BR-10 esce doppio perché patente FISE mancante E tessera IRHA mancante condividono lo stesso codice; il messaggio umano esiste nel payload ma la UI lo butta.) | `29-stable-mie-iscrizioni.png` | **(a)** |
| 2 | **Avvisi non azionabili dall'attore che li vede**: la scuderia vede "tessera mancante" ma il roster non permette di inserire tesseramenti/data di nascita DOPO la creazione del cavaliere — chi vede il problema non può risolverlo né sa chi può. | 29 + `36-org-classe-checkin.png` | **(b)** |
| 3 | **Desktop stable = mobile allargato**: card singola su 1440px, bottom-nav da telefono in fondo allo schermo, zero tabelle. Le scuderie lavorano da desktop. | `32-stable-DESKTOP-iscrizioni.png` (e 33, 34 in artefatto) | **(c)** |
| 4 | **PDF non presentabili** — 4 difetti con una diagnosi sola: (i) font standard Helvetica/WinAnsi: i caratteri tipografici dei copy degradano in glifi sbagliati (`−Trofei` → `"Trofei`, nota Art. 15 aperta da `&`) → serve font TTF embedded; (ii) timestamp ISO nudo spezzato a metà riga nella colonna note; (iii) `Content-Disposition: inline; filename="start-list.pdf"` statico → sui telefoni si salva come "document" → naming parlante con regola unica; (iv) classifica provvisoria con riga vuota "—" senza spiegare che non ci sono score. | PDF allegati dal titolare + header verificato in censimento | **(d)** |
| 5 | **Riepilogo checkout incoerente**: il copy promette "gli avvisi qui sotto segnalano…" ma sotto NON c'è alcun avviso (compaiono solo DOPO la conferma) — si conferma una spesa citando avvisi invisibili. | `27-stable-enroll-riepilogo.png` | **(b)** |
| 6 | **Codici BR anche nei copy dell'organizer**: la nota del check-in cita "(BR-18)" a video; chip BR-10 doppia identica pure qui (ma con testo, meglio di stable). | 36 | **(a)** |
| 7 | **Mobile "Le mie iscrizioni" illeggibile**: colonna binomio spezzata su 5 righe ("Smart / Dunit · / Giulia / De / Marchi"), card compressa. | 29 | **(c)** |
| 8 | **Plurali rotti**: "1 cavalli distinti" (riepilogo), "1 non chiuse" (scribe run list); "115 €" va a capo tra numero e simbolo. | 27, `44-scribe-post-enter.png` | **(a)** |
| 9 | **Pagina evento pubblica scarna**: nessuna intestazione (date, luogo), gergo interno "Go completato" mostrato al pubblico, niente start list/ETA in vista — lontana dal prototipo `PaginaEvento`. | `46-portal-evento.png` | **(b)** + **F3** |
| 10 | **Messaggi server solo in italiano per utenti EN** ("Credenziali non valide" anche con app in inglese) — già noto come backlog, qui formalizzato: entra nel catalogo strutturato del punto (a). | 31 (artefatto) | **(a)** |

**Ordine proposto Fase 1: (a) → (b) → (c) → (d)** come da piano: (a) chiude 1, 6, 8, 10 con un solo meccanismo (avvisi strutturati + catalogo i18n + guardia sui bundle); (b) chiude 2, 5, 9-parte; (c) chiude 3, 7; (d) chiude 4.

---

## Funnel organizer: conteggio tocchi e punti ciechi (reperto 4 del titolare)

**27 tocchi** dal primo accesso al draw pubblicato: 10 (onboarding org → iscrizioni aperte) + 17 (rientro → classe → draw pubblicato). Punti ciechi rilevati:
- **Vetting senza CTA**: il banner "in verifica" non dice cosa succede dopo né come sollecitare; l'approvazione avviene fuori-app (nel censimento: UPDATE da Console, come su staging) — il back-office admin (BR-72) resta il buco.
- **Doppio passaggio di stato** con conferma ciascuno (Bozza→Annunciato→Iscrizioni aperte): corretto ma non guidato — nessun "prossimo passo" suggerito dalla panoramica.
- **Draw dentro il dettaglio classe**: dal dettaglio evento non c'è una via diretta "fai il draw" — bisogna sapere che vive nella tab della classe.
- **Documenti per-classe**: nessun punto unico "documenti dell'evento".
- Il wizard però regge: categoria+pattern dal catalogo con default sensati, la classe si aggiunge in 2 tocchi.

## Cose che FUNZIONANO (verificate a build di produzione)
Verifica email a doppia via (codice digitato ✓), hint password + occhio + conferma ✓, gate non-verificato ✓, **PR-0 live**: chip "Rookie Level 1 · 100 € · già iscritto" disabilitata al ritorno in griglia ✓ (`30-…gia-iscritto.png`), login errato → messaggio umano ✓, stamp di versione BR-83 in tutte le SPA ✓, scribe via magic link diretto ✓ (run list con binomio e stato coda sync), portale live con classifica del pilota corretta (71.0/70.0/69.5, provvisoria) ✓, locale dal device (browser EN → app EN) ✓.

## Archivio: reperti minori
- Chip classe in griglia: la selezione non mostra il totale parziale per binomio.
- Organizer, riga classe: "AM 0.00 €" — gergo abbreviato (added money) non spiegato.
- Scribe: "Tocca un binomio per segnarlo" ok, ma nessun invito a scegliere il giudice quando sono più di uno (da approfondire in E2E Fase 2).
- Roster stable: nessuna modifica post-creazione dei campi tesseramenti/nascita (vedi top-2); l'edit del nome esiste solo per il flag BR-84.
- Portale home: lista eventi essenziale, senza tema/tier del design system (Fase 3).

## Nota metodologica
Playwright locale su build di produzione: fedele su UX/funnel/copy; cieco su latenza reale, CDN e comportamento PWA su iOS (restano al collaudo umano su staging). Il driver del censimento è archiviato in `docs/qa/census-driver.mjs` e diventerà la base della suite E2E di Fase 2.
