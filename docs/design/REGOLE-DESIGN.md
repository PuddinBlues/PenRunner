# PenRunner — Regole di design
*Documento vivo. Ogni regola nasce da una decisione presa con Marco; Claude lo rilegge prima di ogni superficie nuova e verifica ogni consegna contro queste regole. Le regole di dominio (⚑) sono norme del reining: non si interpretano, si rispettano.*

## Principio fondante
**Regola del contesto.** Ogni schermata mostra i dati dello stadio in cui l'utente si trova, orientati all'azione che deve compiere lì. Ciò che appartiene a uno stadio futuro non esiste ancora a video; ciò che appartiene a uno stadio passato si comprime in riepilogo. La pagina risponde a "cosa sto facendo adesso?", non elenca funzioni. Corollario di review: per ogni schermata dichiarare stadio servito e azione primaria; ogni dato a video si giustifica rispetto a quei due, o si taglia.

## Struttura e navigazione
1. **Spina dorsale del ciclo di vita.** Le entità con stati (evento: Bozza→Annunciato→Iscrizioni→Draw→In corsa→Chiusura) mostrano il ciclo come struttura della pagina; lo stadio corrente si apre nel "Prossimo passo" con UNA azione primaria.
2. **Ordine d'attenzione in diretta.** Durante un live le righe si ordinano presente → futuro → passato, e il passato si attenua. Fuori dal live, ordine cronologico.
3. **Liste lunghe = finestra + ricerca.** Mai liste integrali di default: finestra sull'adesso con espansioni esplicite, e ricerca per trovare il proprio binomio (per cavallo, cavaliere o scuderia). Ordine di gara e classifica non si impilano: viste alternative con selettore, ricerca condivisa sopra le viste.
4. **Azioni di riga on-hover.** Le azioni si rivelano al passaggio o alla selezione, mai sempre accese; l'azione primaria è la riga stessa. Azioni distruttive: conferma inline dove sta lo sguardo, bottone pieno danger, mai modal se basta la riga.

## Dati e input
5. **Dati strutturati mai come testo libero.** Date, importi, scelte da catalogo: si scelgono da controlli che rendono l'errore impossibile (calendario a intervallo, vincoli fisici — giorni non validi spenti, default intelligenti proposti).
6. **Formato umano a video, sempre.** "12–14 settembre 2026", mai ISO; numeri tabulari; IT/EN. L'ISO vive solo nei dati.
7. **Confine dei codici fin dal design.** Nessun codice interno (BR-*, enum) a video: requisiti e avvisi come testo umano con l'azione dell'attore giusto ("Completa il profilo", "Paga ora · 30 €"). Il costo appare solo quando richiede un'azione.
8. **Stime dichiarate.** Gli orari previsti portano il ~ e dichiarano la fonte ("ritmo attuale 4 min a run"); si aggiornano col ritmo reale.

## Copertine e identità evento
9. **Copertina obbligatoria.** Ogni evento ha un'immagine scelta alla creazione (collezione, logo, upload). Tre taglie dalla stessa immagine: hero, card calendario, riga lista. La card con copertina è l'unità narrativa del registro scuro.
10. **Due tipi di copertina.** Foto: piena, objectFit cover, gradiente scuro dal basso. Logo: centrato, mai stirato, fondo campionato dai bordi del logo stesso (all'upload, server-side; bordi trasparenti esclusi; fallback scuro brand se bordi eterogenei). La UI può coprire in parte il logo: accettato.
11. **Il testo non negozia il contrasto.** La fascia del titolo poggia sempre su scuro garantito, qualunque copertina.
12. **Preset e volano.** Copertine di default con licenza regolarizzata; a regime si propongono le foto delle edizioni precedenti dell'evento e i loghi dei circuiti.

## Classi e livelli (modello Categoria + Livelli)
13. ⚑ **Classe = categoria + livelli che corrono insieme.** Draw unico mischiato. Lo stesso livello della stessa categoria mai in due classi dello stesso evento (nei form: livelli occupati spenti e barrati). Nomi generati: "Open · L1–L4", "Green · L1". Combinazioni realistiche nei dati d'esempio (Non Pro esiste come L1–L4, non L3-L4 da soli).
14. ⚑ **Classifiche sempre separate per livello.** La generale di categoria è bonus non ufficiale, marcata come tale ("i livelli premiano separatamente"). Premi e payback per livello.
15a. ⚑ **Il draw si sorteggia per giornata, la sera prima.** Su eventi multi-giornata le giornate successive non hanno ordine fino al sorteggio: la pagina pubblica mostra per ogni giornata lo stato del suo draw ("sorteggio sabato sera — lo pubblichiamo qui appena esce"), senza far sembrare mancante ciò che non è ancora dovuto. [Aperto con Sara: vincolo tecnico o abitudine? D4 intervista]

15. ⚑ **Iscrizione per livello.** Proprio livello + superiore obbligatorio (dentro la classe), ulteriori superiori opzionali, mai inferiori. Una run vale per tutti i livelli iscritti.

## Score e giudici
16. ⚑ **Mai lo score di una run mentre il binomio è in campo.** Né totale né parziali, su nessuna superficie pubblica: lo score appare solo dopo l'annuncio, a run chiusa.
17. **Anatomia unica dello score.** Ovunque appaia uno score con più giudici: parziali in colonne allineate (larghezza fissa, a destra), totale in evidenza a destra. Con un giudice solo, i parziali non esistono. Nessuna intestazione di colonna. Penalità: score 0 in ambra col motivo nella riga, mai una riga vuota o un "—" muto.
18. **Podio colorato, leader in evidenza.** Primi tre col numero in oro/argento/bronzo; niente distacchi dal leader.

## Lingua e contenuto
19. **Niente gergo verso il pubblico.** Il portale parla da spettatore; il gergo tecnico vive negli strumenti di lavoro. "Cognome Nome" in classifica (BR-84), nome naturale altrove.
20. **Dettagli scontati per il pubblico di settore non si dicono.** (Es. misure dell'arena.) Il pattern si indica col numero e apre la pagina pattern.

## Processo
21. **I prototipi sono vincolanti.** Le superfici nuove si progettano prima (prototipo qui, ratifica di Marco), poi si implementano. Ogni superficie con prototipo si chiude col confronto side-by-side.
22. **Regole di dominio: prima si cerca, poi si chiede.** Prima di disegnare meccaniche di gara: grep su docs/ e CLAUDE.md del repo — molte regole sono già scritte (BR-*). A Marco (o alla segreteria) si chiede solo ciò che la documentazione non copre.
23. **Foto segnaposto attuali: licenze da regolarizzare.** Non entrano in produzione né in materiale pubblico.
