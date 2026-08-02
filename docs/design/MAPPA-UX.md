# PenRunner — Mappa UX completa (v1.3 · 30 luglio 2026 — aggiornata con gli esiti dell'intervista a Sara)
*Compagna di REGOLE-DESIGN.md. Qui c'è il territorio: chi entra, da dove, per fare cosa, attraverso quali schermate. Stato di ogni superficie: ✅ prototipo approvato · 🔧 esiste in build ma da allineare · 🕳 buco scoperto · ⏳ dipende da risposte in arrivo (Sara/Code).*

## Il principio delle persone (dal data model: account ≠ anagrafica)
**Il profilo nasce da chi ne ha bisogno; l'account arriva quando la persona lo reclama.** La scuderia crea il cavaliere, l'organizer crea il giudice: sono Person senza account. Il claim (a email verificata) trasforma il profilo in identità autonoma, senza perdere nulla di ciò che altri hanno già costruito attorno. Vale per cavalieri, giudici e in prospettiva proprietari.

## Gli attori e la loro domanda fondamentale
1. **Pubblico/spettatore** (nessun account) — "cosa succede e quando corre il mio preferito?"
2. **Scuderia** (account stable; dentro: titolare e segretaria di scuderia) — "iscrivo i binomi, pago, e so quando tocca a noi"
3. **Cavaliere** (Person creata dalla scuderia → account via claim) — "gestisco io le mie iscrizioni: scratch, i miei orari, il mio storico"
4. **Organizzatore** (account organizer; dentro: presidente e segreteria evento, es. Sara) — "porto l'evento dalla bozza ai documenti finali senza annegare"
5. **Giudice/scribe** (Person creata dall'organizer; magic link come accesso del giorno; account via claim) — "inserisco gli score in campo, anche offline — e le mie giudicate restano mie"
6. **Admin PenRunner** (noi) — "sblocco, correggo, osservo" — *pannello ancora da progettare*

## Viaggio 1 — Pubblico
**Ingressi**: link diretto condiviso (WhatsApp/social, il più frequente), Home del portale, QR a bordo campo (da produrre come feature: QR sulla start list stampata → 🕳 piccolo, alto valore).
**Percorso**: Home ✅ (HomePortale v4: hero live, calendario, ricerca, filtri regione) → Pagina evento ✅ (PaginaEventoPubblica: stadi annunciato/iscrizioni/draw/diretta/concluso; ordine di giornata collassabile; classifiche per livello) → Pagina pattern ✅ (prototipo sessione 1) → Scoreboard proiettato ✅ (prototipo sessione 1, da rivedere col canone: anatomia score, ordine d'attenzione → 🔧).
**Buchi**: pagina cavallo/cavaliere (la nav della Home la promette: "Cavalli & cavalieri" → 🕳 da progettare: storico run, earnings, eventi); risultati cross-evento ("Risultati" in nav → 🕳); notifiche/"segui l'evento" (🕳, rimandabile).

## Viaggio 2 — Scuderia
**Ingressi**: link "Iscrivi la tua scuderia" dalla pagina evento pubblica; accesso diretto; invito.
**Percorso**: registrazione/verifica email 🔧 (funziona, censita: gate non-verificato ok) → Roster cavalli+cavalieri 🔧 (esiste; avvisi non azionabili in correzione con Fase 1(b); post-modello-classi il binomio avrà il livello base ⏳Code) → Iscrizione massiva ✅ prototipo / 🔧 build (desktop stable in costruzione su design, Fase 1(c); con pacchetti di livello ⏳Sara D2 + piano Code) → Checkout 🔧 (promessa avvisi corretta in (b)) → Le mie iscrizioni ✅ (MieIscrizioni: stati contestuali, avvisi umani con azione, orario stimato, ritiro con conferma) → durante l'evento: orario stimato/diretta ✅ → dopo: risultati e documenti ✅ (nella pagina evento).
**Buchi**: import CSV roster (#58, aspetta intervista segretaria scuderia → ⏳); box/paytime (dal programma LR: prenotazione con finestre e priorità — 🕳 GROSSO, probabilmente il modulo che vende il pilota a LR → da progettare dopo le risposte di Sara); pagamenti reali → **DECISIONE CHIUSA (Sara)**: la piattaforma per ora NON gestisce denaro; i conti si emettono per scuderia e la scuderia regola coi cavalieri. PenRunner calcola e mostra il conto (oggi cambia ≥5 volte a iscrizione su Excel: il valore è il conto sempre giusto, aggiornato da solo), l'incasso resta fuori.

## Viaggio 3 — Cavaliere (via claim)
**Ingresso**: invito al claim — email/link generato quando la scuderia lo crea o alla prima iscrizione ("Sofia, la tua scuderia ti ha iscritto: reclama il tuo profilo"). 🕳 flusso di claim da PROGETTARE (la spec lo prevede, la UI non esiste).
**Percorso post-claim**: il suo profilo pubblico (= pagina cavaliere, cantiere 3: storico run, earnings — che determinano il livello base!) → le sue iscrizioni (vista cavaliere di MieIscrizioni: solo i suoi binomi, i suoi orari stimati) → **scratch in autonomia** ✅ regole già in spec (BR-17: `self_scratch_enabled` default on, scelta dell'organizzatore — ON: concorrente o scuderia ritirano in-app fino al proprio turno; OFF: si comunica dal vivo e registra l'organizzazione; fee sempre dovuta; cascata automatica su ETA, draw col buco mantenuto, classifica/payout; non annullabile dopo l'inizio classe, il rientro passa dall'organizzatore) / 🕳 UI cavaliere da progettare col claim → notifiche dei suoi orari ⏳.
**Nota di modello**: gli earnings del cavaliere sono il dato che governa l'eleggibilità ai livelli — il claim è anche il modo per cui il dato diventa affidabile (lo mantiene l'interessato).

## Viaggio 4 — Organizzatore
**Ingressi**: "Organizza un evento" dalla Home; accesso diretto.
**Percorso**: Creazione evento ✅ (CreazioneEvento v4: identità+copertina con anteprima live, classi=categoria+livelli con modifica/rimozione, date a calendario con default) → Regia evento ✅ (OrganizerRegia: spina dorsale, pannelli contestuali per stadio) → Annuncio/apertura iscrizioni ✅ regia → gestione iscrizioni e verifiche check-in ✅ regia / 🔧 build (funnel censito: 27 tocchi, vetting senza CTA — la regia è la risposta, da implementare in Fase 3+) → Draw per giornata ✅ regola (sera prima, confermato D4: fino all'ultimo qualcuno cambia idea o si iscrive tardi) / 🕳 **DRAW EDITOR — il dolore #1 dichiarato da Sara**: il legacy fallisce sempre nel distanziare i cavalli dello stesso cavaliere (min 8, ideale 10+ tra l'uno e l'altro nella stessa categoria) e lei sistema a mano. Feature decisa: lista draw con drag&drop, flag automatico di vicinanza a ogni spostamento, auto-suggerimento dell'ordine che garantisce 10+ → Diretta (assegna scribe via magic link 🔧 funziona) → Chiusura e documenti ✅ (template PDF nuovi; generazione 🔧 allineare ai template; **+ export risultati in CSV** — richiesta esplicita di Sara, oggi solo PDF: costo minimo, valore alto).
**Buchi**: gestione box/paytime lato organizer (🕳 come sopra, speculare alla scuderia); comunicazioni alle scuderie (oggi WhatsApp; un "avvisa tutte le scuderie" dalla regia → 🕳 da valutare col pilota); multi-giudice: assegnazione dei 3 giudici e pesi → 🔧 (lo schema c'è, la UI organizer è povera; nota Sara: giudici e scribe si scelgono PRIMA di organizzare l'evento → la convocazione va in creazione evento, non in diretta); **vetting flags** (a cui Sara tiene molto): patente scaduta/non valida, tesseramento IRHA e NRHA, cavallo non di proprietà dove obbligatoria — flag automatici + "avvisa la scuderia" con un tocco → 🔧 estende gli avvisi check-in già disegnati.

## Viaggio 5 — Giudice/Scribe
**Il giorno dell'evento**: magic link 🔧 (resta: è l'accesso a zero attrito del giorno — ma punta a una Person giudice, non è l'identità) → ordine di entrata ✅ → scoring per manovra con penalità ✅ (prototipo sessione 1; regola ⚑16: pubblicazione a run chiusa, MAI parziali live in pubblico — verificare la build → 🔧) → firma e chiusura classe ✅ prototipo.
**Oltre il giorno (via claim)** 🕳: storico delle giudicate, convocazioni future ("sei stato invitato come giudice B alla 5ª tappa"), nome precompilato sui documenti ufficiali, firma degli score come identità verificata. Da progettare insieme al claim del cavaliere: stessa macchina.
**Buchi**: collaudo offline/iOS-PWA su staging (rischio dichiarato, collaudo umano).

## Viaggio 6 — Admin (noi)
**Progettato ✅** — prototipo VINCOLANTE `prototypes/AdminPanel.jsx` (v2 ratificata da Marco). Concetto: sidebar scura + barra comando ⌘K (cerca eventi/persone/run, azioni rapide), home "Oggi" a **triage con anzianità** (non dashboard), **pattern ispettore laterale** (ogni riga apre un pannello, il contesto non si perde mai), correzione score dentro l'ispettore della run con **motivo obbligatorio**, registro a **timeline solo-aggiunta** filtrabile. Solo desktop, per scelta. Principio di spec: **"qui non esistono azioni silenziose"** — ogni azione admin firmata, motivata, a registro append-only. Implementazione NON in coda dev: resta la sequenza approvata (BR-89 → cantiere L1).

## I passaggi di testimone (dove gli attori si toccano — i punti più fragili)
- Pubblico→Scuderia: CTA "Iscrivi la tua scuderia" ✅
- Organizer→Scribe: magic link 🔧 ok
- Organizer→Pubblico: annuncio evento ✅ regia
- Scuderia→Organizer: avvisi check-in ✅ (disegnati speculari: la scuderia vede "da completare", l'organizer "da verificare")
- Scuderia→Cavaliere: invito al claim 🕳 (da progettare — il momento più delicato: dev'essere un regalo, non una richiesta)
- Organizer→Giudice: creazione Person + magic link 🔧, poi invito al claim 🕳
- Sistema→Tutti: email transazionali 🔧 (funzionano; testi da passare al setaccio del confine dei codici)

## La scoperta strategica — il database IRHA
Gli organizzatori italiani ricevono da IRHA un **database zippato** (cavalli, proprietari, tesseramenti, stati) e lo importano nel gestionale legacy; gli aggiornamenti NON sono automatici — si ricarica il pacchetto a mano, a volte a gare già iniziate. Due conseguenze:
1. **Cantiere Import IRHA**: PenRunner deve ingerire quel pacchetto (upload zip → parsing → merge su anagrafiche Person/Horse con diff visibile: nuovi/aggiornati/conflitti). È la fonte dei dati di vetting (patenti, tesseramenti, proprietà) e azzera il data-entry del roster.
2. **Gate di adozione**: il software va approvato da IRHA per essere usato → contatto con Federica (segreteria IRHA) = passo commerciale e tecnico insieme (proposta + formato dati + eventuale futuro feed automatico).

## Adozione — nota onesta dal campo
Sara organizza da sola, ~20 giorni di lavoro a evento, ed è titubante: "è tutto molto complesso". La risposta non è più feature, è **affiancamento**: al pilota PenRunner si guida insieme (noi in regia con lei), e il numero da attaccare è quello — da 20 giorni a molti meno. Ogni organizzatore ha il suo metodo: il prodotto deve assorbire i loro dati (import IRHA, conto che si aggiorna da solo), non imporre un metodo nuovo dal giorno uno.

## Ordine dei cantieri di design che la mappa produce
*(riordinati il 30/7 sugli esiti dell'intervista: il dolore #1 non era il box, è il draw)*
1. **Draw editor** — drag&drop, flag vicinanza a ogni spostamento, auto-ordine che garantisce 10+ (dolore #1 dichiarato; è anche la demo che vende)
2. **Import database IRHA** — fonte anagrafiche e vetting, gate di approvazione (con Federica)
3. **Vetting flags + "avvisa la scuderia"** — patenti, tesseramenti, proprietà (estende gli avvisi check-in ✅)
4. **Export CSV risultati** — piccolo, richiesto esplicitamente, si fa subito
5. **Claim di cavaliere e giudice** — sblocca scratch autonomo, earnings affidabili, firma verificata (una macchina, due attori)
6. **Box/paytime** — bozza sotto; le 3 domande operative restano aperte
7. **Pagina cavallo/cavaliere + Risultati cross-evento** — le promesse della nav; la pagina cavaliere è anche la casa post-claim
8. **Scoreboard proiettato** al canone · **Admin panel** minimo vitale (progettato ✅ — `AdminPanel.jsx`, implementazione non in coda) · Comunicazioni organizer→scuderie · QR su start list

---

## Cantiere 1 in bozza — Modulo Box & Paytime
*(dai dati reali del programma 5ª tappa LR 2026 · Cremona Fiere 25–30 agosto · Added 20.650 € · da validare con Sara, poi diventa spec per Code)*

**Cosa dice il mondo reale (programma LR):** prenotazione box con finestre temporali e **priorità alle scuderie lombarde**; paytime (piste di prova a pagamento, a slot); **preiscrizioni obbligatorie ma non vincolanti**; penali di disdetta box; **chiusura iscrizioni alle 18:00 per il giorno successivo**; le categorie possono spostarsi di giornata in base alle preiscrizioni.

**Entità nuove:** Box (inventario per evento: quantità, prezzo, finestre, regole priorità) · Prenotazione box (scuderia → n box, stato, penale) · Slot paytime (giorno, orario, capienza, prezzo) · Preiscrizione (binomio → categoria, non vincolante, alimenta lo spostamento categorie).

**Lato scuderia (dentro il flusso iscrizione, non un modulo a parte):** al momento dell'iscrizione la scuderia vede "Box: disponibili da [data apertura finestra]" → prenota n box + eventuali slot paytime nello stesso carrello delle fee → riepilogo unico con penali di disdetta esplicite in linguaggio umano. Stati: richiesto / confermato / in lista d'attesa (finestra priorità) / disdetto (con penale calcolata).

**Lato organizer (pannello della regia, stadio iscrizioni):** definizione inventario e finestre alla creazione evento (estensione di CreazioneEvento) → cruscotto occupazione box in tempo reale → lista d'attesa con la regola di priorità applicata dal sistema, non a mano → vista preiscrizioni per categoria che suggerisce lo spostamento di giornata ("Rookie 1: 4 preiscritti → proponi spostamento a sabato").

**Regole candidate (numerazione da assegnare dopo BR-84):** priorità configurabile per attributo scuderia (es. regione=Lombardia) con finestra dedicata; penale disdetta come % o importo fisso per fascia temporale; preiscrizione non genera fee ma genera segnale per il draw/giornate; cut-off 18:00 come regola dell'evento, non hardcoded.

**Risposte D1–D4 (30/7):** D1 fee per categoria, montepremi splittato in % da manuale · D2 montepremi = iscrizioni + added − spese organizzative · D3 dipende, ogni gara è diversa · D4 draw sera prima, per flessibilità su ripensamenti e iscrizioni tardive.
**Ancora aperte (prossimo giro con Sara):** chi gestisce oggi la lista d'attesa box e con che criterio? le penali di disdetta vengono davvero riscosse? il paytime si prenota in anticipo o è a esaurimento in loco?
