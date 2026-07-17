# Reference / asset

## Immagini eventi

I prototipi (`Home.jsx`, `PaginaEvento.jsx`) usano foto d'azione del reining come **segnaposto**, incorporate in base64 direttamente nei file. Sono immagini di eventi reali usate solo a scopo dimostrativo.

**In produzione servono immagini con diritti d'uso**, tipicamente caricate dall'organizzatore al momento della creazione dell'evento (`Event.hero_image`).

La regola di trattamento (overlay scuro dal basso per garantire la leggibilità del testo) è documentata in `design/design-tokens.md` e funziona con qualsiasi foto, quindi non vincola la scelta delle immagini definitive.

## Pattern IRHA — `patterns.json`

Il seed dei `Pattern` è **già pronto**: `patterns.json` contiene i 20 pattern ufficiali IRHA 2026 (1–18 + A, B) digitalizzati dal Patternbook, con per ciascuno: codice, regola d'ingresso (walk/trot/lope-in), classi ammesse (A e B sono riservati a Youth 10&Under / Short Stirrup) e la sequenza ordinata delle manovre tipizzate.

Da confermare con un giudice prima del go-live: il raggruppamento dei passi di gara nelle ~7–8 manovre-segnate del cartellino (schema NRHA). Il refuso del Pattern 14 (step finale) è stato corretto su conferma del committente: sliding stop + back.

## Diagrammi pattern — da produrre

Le tavole NRHA non si ridistribuiscono (copyright) e i tentativi di generazione programmatica sono stati scartati: il tracciato continuo del pattern è l'informazione stessa, e le approssimazioni non reggono il giudizio di chi i pattern li conosce. Due strade valide: (a) chiedere a IRHA il permesso d'uso delle tavole ufficiali (plausibile, dato che PenRunner opera nell'ecosistema IRHA); (b) ridisegno vettoriale manuale da designer, ricalcando le tavole in Figma e ri-stilizzando nei token PenRunner (con verifica legale rapida). In MVP bastano i passi testuali di `patterns.json`.


## Categorie IRHA-FISE — `categories.json`

Le 24 categorie ufficiali 2026 digitalizzate dallo schema del rulebook, su 4 campionati (Debuttanti, Italiano, Assoluto, Facoltative regionali). Per ciascuna: codice classe, patente FISE, tessere richieste, obbligo di tecnico federale, vincolo di proprietà del cavallo (vocabolario codificato), limiti d'età con regole di permanenza, tetti di vincite con riferimento al circuito (IRHA in EUR / NRHA in USD). Punti aperti in coda al file: definizione operativa di "di proprietà", verifica qualifiche NRHA/Reiner Suite, mappatura con Person.category.
