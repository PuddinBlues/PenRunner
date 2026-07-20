# PenRunner — Guida per Claude Code

> Gestionale per le gare di reining (IRHA/FISE, Italia). Questo file orienta lo sviluppo: leggilo per primo, poi consulta i documenti in `docs/` quando servono dettagli.

## Cos'è PenRunner

Una piattaforma web per gestire le competizioni di reining dall'organizzazione dell'evento alla pubblicazione dei risultati. Alternativa moderna a ShowManager, con focus su iscrizione massiva per scuderie, scoring mobile per i giudici, e risultati live pubblici.

**Quattro utenti principali:** organizzatore (crea e gestisce l'evento), concorrente (rider/owner), scuderia/coach (iscrive molti binomi), pubblico (segue calendario e dirette). Ruoli operativi in gara: giudice e segreteria/scribe.

**Modello di business (revenue split discrezionale, BR-02):** piattaforma gratuita per tutti. Prezzo al cavaliere: fee_per_horse (organizzatore, default 15 €). Quota PenRunner: platform_fee_per_horse (default 15 € = nessuno split); lo sconto con margine all'organizzatore (es. 10/5) è una LEVA COMMERCIALE concessa caso per caso — impostabile solo dal Platform Admin (per organizzazione, override per evento, scrittura auditata BR-71), mai dall'organizzatore, che vede il proprio margine nel wizard. Rendiconto MVP = cavalli distinti × quota concordata. Fee sempre derivate, mai memorizzate.

## Stack consigliato

Niente è ancora stato scelto in modo vincolante — queste sono raccomandazioni coerenti con i prototipi già fatti (React + stato locale). Adatta se hai motivi migliori, ma mantieni la coerenza una volta deciso.

- **Frontend:** React + TypeScript. I prototipi in `prototypes/` sono in React (JSX) e usano stato locale con `useState`/`useMemo` — sono il riferimento diretto per UI e logica.
- **Styling:** i token sono già definiti (vedi `design/design-tokens.md`). Va bene Tailwind (mappando i token nel theme) o CSS-in-JS; i prototipi usano inline style con un oggetto token `C`.
- **Backend/DB:** non vincolato. Il data model (`docs/data-model.md` + `docs/data-model.html`) è pensato relazionale (entità con UUID, FK). Postgres è una scelta naturale.
- **Offline-first per lo scoring:** requisito non negoziabile (vedi sotto). Va progettato presto, non aggiunto dopo.

## Regole di prodotto da non violare

Queste derivano dal regolamento di reining e da decisioni di design prese con cura. Cambiarle rompe la correttezza del prodotto.

### Scoring (il cuore del dominio)
- Il punteggio di una run parte da **70**. Formula: `score = 70 + Σ(voti qualità manovre) − Σ(penalità manovre) − penalità_di_run`.
- Ogni manovra ha un **voto qualità** da −1.5 a +1.5 a passi di 0.5.
- Le **penalità di manovra** sono inserite dallo scribe come un **singolo numero totale** per manovra. NON costruire cataloghi di penalità per tipo, NON chiedere il motivo: lo scriba è esperto, somma a mente e digita la cifra. Questa semplificazione è stata decisa esplicitamente dopo diverse iterazioni — non reintrodurre complessità.
- Le **penalità di run** (es. 5 punti) sono separate da quelle di manovra: appartengono all'intera prova, hanno il loro campo.
- Esiti speciali: `score_0` (fuori pattern, ordine errato → punteggio 0 ma in classifica) e `no_score` (squalifica, abuso → fuori classifica). Sostituiscono il punteggio.
- Con più giudici, lo score finale della run è la SOMMA delle ScoreCard (con 5 giudici: esclusi il più alto e il più basso; a parità di scarto, se ne esclude uno solo).
- Lo score sotto 70 va segnalato visivamente (i prototipi virano in ambra).

### Offline-first (scoring giudice)
- L'app giudice/scribe DEVE funzionare senza rete e sincronizzare al rientro senza perdita dati.
- La ScoreCard si compila localmente, passa a "validata" solo dopo firma + sync. Mostra sempre lo stato offline e la coda di sync.
- Le modifiche dopo la firma richiedono un evento di correzione tracciato (audit log).

### Turno stimato (ETA)
- Per concorrenti e pubblico: "tra quanto entra in campo". Vista **derivata, mai memorizzata** (BR-50): `ETA = àncora + Σ slot run rimanenti (scratch esclusi) + drag + pause`.
- Default: slot 270 s, drag ogni 5 run da 420 s (= la regola reale "10 cavalli/ora"); ri-ancoraggio a ogni ingresso in campo e media mobile della cadenza osservata; ritardo a cascata sulle classi successive.
- Display onesto: sempre "~", stato "da programma" vs "live", mai un orario promesso. Notifica push a soglia = Fase 2, default 75 minuti (finestra di sellaggio ~75–60').
- Scratch (BR-17): lo scratch self-serve è un'IMPOSTAZIONE dello show (`self_scratch_enabled`, default on, scelta dell'organizzatore). On = concorrente/scuderia ritirano in-app fino al proprio turno; off = si comunica dal vivo e registra l'organizzazione. In entrambi i casi la cascata (ETA anticipata, draw col buco, esclusione da classifica/payout) è automatica e la fee resta dovuta dal cavaliere.

### Special events multi-go (BR-33, Fase 2)
- Futurity/Derby/Maturity: go di qualificazione + finale ad accesso limitato — NON in MVP, predisposto da runs.go_round. Accesso alla finale = parametro dalle conditions dello show. Regole Handbook da non contraddire mai: 0 e no score non avanzano; il qualificato con 0/scratch in finale resta payout-eligible (0 sopra scratch). E in ogni classe: score 0 visibile in classifica ma MAI eligibile ai piazzamenti a premio (vincola il payout, step 7).

### Chiusura ≠ firma (BR-27)
- La CHIUSURA (scribe, fine run) mostra il totale, sincronizza e alimenta il live come provvisorio — è l'annuncio. La FIRMA del giudice è in batch a fine classe (elenco carte con totali visibili, tratto per carta); prima della firma la carta è riapribile con evento tracciato, dalla firma è immutabile. Il gate non rallenta mai per firmare.

### Score in review (BR-29)
- Penalità dubbia → il giudice trattiene lo score: carta NON firmata con nota del dubbio, stato annunciato come evento di run ("Score in review" al posto del numero, in inglese in entrambe le lingue). Risoluzione al drag successivo: si fissa UN valore e si firma. Nessun doppio valore memorizzato; la firma resta l'unica ufficializzazione.

### Modalità degradata (BR-28)
- Se il digitale si ferma: carta + radio come oggi, poi BACKFILL delle carte cartacee da organizzatore/segreteria — ScoreCard con source=manual_backfill, auditata, firma digitale mai simulata (fa fede la carta cartacea agli atti). PenRunner non è mai un single point of failure dello show.
- Fine go: al completamento dell'ultima run, la pagina evento mostra automaticamente classifica del go (provvisoria) + start list di chi entra — tutto derivato, zero azioni manuali.

### Draw (BR-19, BR-43)
- Distanziamento stesso cavaliere: obiettivo 7-8 cavalli in mezzo (warm-up del cavallo successivo), default generazione 8, degradazione a scala con warnings, mai fallimento.
- Chirurgia del draw pubblicato = capacità concessa PER EVENTO (events.draw_surgery_enabled, default off; attiva solo il Platform Admin, per l'intero evento; visibile read-only all'organizzatore; auditata). Flag off → solo late entry in coda. Flag on → spostamenti auditati; spostamento in prima posizione dopo un drag annotato automaticamente.
- Drag calcolati sulle run EFFETTIVE (scratch esclusi), marker di drag derivati visibili sulla start list pubblica in tempo reale — trasparenza: nessuno scopre al cancello che il confine si è spostato.

### Principio "the show must go on" (BR-18)
- Sull'eleggibilità il sistema SEGNALA, mai blocca: nessun avviso (BR-10, 13..16) impedisce iscrizione, check-in o partenza. L'organizzatore vede e decide; gli avvisi restano registrati come traccia. Bloccanti solo i vincoli di integrità dei dati (BR-11, scale punteggio) — stati privi di senso, non giudizi sportivi.

### Platform Admin (BR-70..73)
- Ruolo staff PenRunner fuori dalla matrice pubblica, back-office /admin. MVP: visura cross-tenant, coda vetting organizzatori, sospensione account, merge duplicati persona/cavallo con anteprima.
- Ogni azione admin → audit log immutabile; correzioni su dati di gara SOLO via flussi BR-40/41 con admin come attore. GDPR: export/cancellazione dati dal back-office.

### Fee
- La fee è per **cavallo iscritto distinto**, non per iscrizione a classe. `fee = COUNT(DISTINCT horse) × fee_per_horse`.
- È inclusa e mostrata in modo trasparente nella quota; in MVP non si incassa in piattaforma.

### Classifica e payout
- Sono **viste derivate**, non entità memorizzate: si ricalcolano da run e iscrizioni. Questo evita disallineamenti quando uno score viene corretto.

## Sistema visivo

Identità: "Apple per il rigore, Netflix per lo spettacolo". Due registri:
- **Registro chiaro** (lavoro: iscrizione, scoring, segreteria) — bianco, slate, un solo accento verde, massima leggibilità.
- **Registro scuro** (spettacolo: pagina evento pubblica, live results) — fondo notte, numeri protagonisti, trattamento fotografico.

Regole chiave (dettaglio in `design/design-tokens.md` e `design/styleguide.html`):
- **Accento unico:** verde sella `#15803D`, solo per le azioni di sistema. Non spargere altri accenti.
- **Rosso `#DC2626` = solo "in diretta".** Mai per errori (quello è danger `#B91C1C`).
- **Numeri sempre tabulari** (`font-variant-numeric: tabular-nums`) ovunque compaiano punteggi/importi.
- **Tema + tier degli eventi:** ogni evento ha un colore-tema (scelto dall'organizzatore) e un tier di importanza (regionale → nazionale → internazionale → premium). Il tier governa il *trattamento* visivo crescente; l'**oro `#C8902F` è riservato al solo tier premium**.
- **Foto eventi:** sempre con overlay scuro dal basso che garantisce leggibilità del testo. La leggibilità non si negozia con l'estetica.
- Tipografia: Inter. Raggi 8px. Bordi sottili 0.5px.

## Modello dati in breve

Dettaglio completo in `docs/data-model.md`. Entità principali:

- **Anagrafiche:** `Person` (rider/owner, con category open/non_pro/youth/rookie), `Horse` (microchip, licenza), `Stable`.
- **Evento:** `Event` (tier, tema, fee_per_horse, status), `Class` (lega evento↔pattern, added_money), `Pattern` (dal Patternbook IRHA, con `Maneuver[]`), `Maneuver` (definizione: tipo + ordine).
- **Iscrizione/gara:** `Entry` (binomio cavallo+rider in una classe, draw_number), `Run` (esecuzione, go_round, final_score), `ScoreCard` (valutazione di un giudice: run_penalty, special), `ManeuverScore` (per manovra: quality + penalty).

**Regole di scoring dal rulebook:** `reference/scoring-rules.md` digitalizza il regolamento 2026 — cause complete di score_0, catalogo penalità (5/2/1/½ con le scale cumulative), pari merito e Tie Judge, procedura di review ufficiale (finestra 30 minuti: i risultati live sono provvisori fino a +30' dall'ultima run, poi ufficiali), formula del montepremi (iscrizioni + AM − trofei − 20%) con tabella Payback digitalizzata e validata in `reference/payback-schedules.json`, definizione operativa di proprietà Non Pro (famiglia stretta, lease, regola 180 giorni), regole multi-giudice chiuse (punteggio mostrato = SOMMA delle carte; con 5 giudici esclusi alto e basso, a parità di scarto se ne esclude uno solo) e struttura della score card ufficiale verificata su una card reale (colonne manovra con PENALTY+SCORE, legenda qualità identica a BR-21, firma del giudice). È la fonte per il motore di scoring.

**Seed categorie:** le 24 categorie ufficiali IRHA-FISE 2026 sono digitalizzate in `reference/categories.json` — codici classe, campionato, patente FISE, tessere, vincoli di proprietà del cavallo, limiti d'età, tetti di vincite (attenzione: riferimenti IRHA in EUR e NRHA in USD a seconda della categoria). È il catalogo da cui l'organizzatore sceglie le Class e contro cui si valuta l'eleggibilità (BR-10, BR-13..16).

**Seed pattern:** i 20 pattern ufficiali IRHA 2026 (1–18 + A, B) sono digitalizzati in `reference/patterns.json` — sequenza manovre, ingresso (walk/trot/lope-in), classi ammesse. Usarli per popolare il catalogo Pattern e assegnarli alle Class. Regola: per i pattern walk-in lo show management può imporre il trot-in (pubblicandolo); violazione → score_0.

**Stati evento:** bozza → annunciato → iscrizioni aperte → iscrizioni chiuse → in corso → concluso.
("annunciato" = pubblico sul calendario ma iscrizioni non ancora aperte.)
**Stati run:** attesa → in inserimento → in attesa firma → validata → pubblicata.

## Le schermate (prototipi di riferimento)

In `prototypes/` ci sono 4 prototipi React funzionanti, già validati. Usali come specifica viva di UI e interazioni — riproduci comportamento e look, non necessariamente il codice (è prototipale, stato locale, dati mock in cima a ogni file).

1. `Home.jsx` — home pubblica. Hero scuro + corpo chiaro, calendario con tema/tier, ricerca e filtri regione.
2. `PaginaEvento.jsx` — pagina evento pubblica, registro scuro. Live results, classifica che si riordina all'arrivo di uno score, binomio "in campo".
3. `IscrizioneMassiva.jsx` — iscrizione scuderia, desktop. Griglia binomi, assegnazione classi multiple, calcolo costi+fee live, checkout.
4. `ScoringGiudice.jsx` — scoring scribe, mobile. Voti per manovra, widget penalità (inserimento numerico), score live con viraggio colore, firma offline.
5. `Scoreboard.jsx` — vista arena fullscreen per maxischermi (MVP, step 6): IN CAMPO, PRECEDENTE con score enorme, A SEGUIRE con ETA e marker drag, leader del go. Kiosk, registro scuro, auto-aggiornante, si apre su qualsiasi TV con browser. Rosso #DC2626 solo per lo stato live.
6. `PaginaPattern.jsx` — pagina pattern pubblica (per classe). Regola d'ingresso, sequenza numerata delle manovre da `reference/patterns.json`. Linkata da pagina evento, start list e app scribe. Diagrammi: mai le tavole NRHA (copyright) — si generano SVG originali dai dati di patterns.json, in stile PenRunner; in MVP bastano i passi testuali.
Diagrammi dei pattern: NON esistono ancora asset validi. In MVP la PaginaPattern mostra i passi testuali (da `reference/patterns.json`, che è completo e valido). I diagrammi arriveranno per una di queste vie: (a) permesso IRHA/NRHA di usare le tavole ufficiali, oppure (b) ridisegno vettoriale manuale da parte di un designer (es. in Figma, ricalcando le tavole e ri-stilizzando). Non tentare di generarli programmaticamente: la geometria continua del tracciato è l'informazione, e le approssimazioni per primitivi risultano sbagliate a chi conosce i pattern.

## Priorità suggerita per l'MVP

Il ciclo gara completo end-to-end. In ordine di dipendenza:
1. Anagrafiche + Evento + Class + Pattern (le fondamenta).
2. Iscrizione (singola + massiva scuderia) con calcolo fee.
3. Draw order.
4. Scoring offline-first + firma.
5. Classifica live + portale pubblico (home + pagina evento).
6. Payout e documenti (PDF start list/results).

## Specifica funzionale (comportamento del prodotto)

`docs/spec-funzionale.html` è la fonte di verità sul **comportamento**: ruoli e matrice permessi, onboarding dei quattro tipi di utente, modello di identità delle anagrafiche (dedup su microchip/email, account rivendicabili), i dieci flussi end-to-end con diramazioni e stati di errore, le macchine a stati complete (incluse ScoreCard e Payment), il catalogo numerato delle regole di business (BR-01…BR-42) e le notifiche. Leggila dopo questo file: i prototipi mostrano i percorsi felici, la spec copre tutto il resto. Le regole BR sono citabili nelle issue.

## Punti aperti (da validare con un giudice prima di implementare lo scoring fine)

Vedi la sezione "Decisioni aperte" di `docs/spec-funzionale.html` e la sezione finale di `docs/data-model.md`. Due categorie: (1) decisioni di prodotto già prese da ratificare (organizzatori vetted, tesseramenti verificati al check-in, identità primo-creatore, firma su dispositivo scribe, fee che matura alla conferma); (2) valori di dominio da validare sul Patternbook IRHA (catalogo manovre, tie-break, schema payout, media giudici con scarti, soglie score_0, finestra di rilievo). Le decisioni aperte NON bloccano l'inizio: solo il motore di scoring fine attende la validazione, ed è più avanti nell'ordine di lavoro.

## Note di metodo

- Lingue: **italiano + inglese** (BR-60..62), entrambe complete all'MVP. Locale iniziale dal dispositivo (it → italiano, altro → inglese), selettore manuale persistito, i18n-ready dal primo componente (stringhe esternalizzate). Il gergo di gara resta inglese in entrambe; email secondo la preferenza utente (campo locale su Person); pagine pubbliche con percorsi /it/ /en/. Le descrizioni inglesi dei pattern esistono nell'Handbook NRHA e si potranno aggiungere a patterns.json come campo "en".
- Copy: verbi attivi, sentence case, niente gergo di sistema. "Conferma iscrizione", non "Submit".
- Tutto il contesto di prodotto (PRD completo) è in `docs/prd.md`.
