**PENRUNNER**

Gestionale per gare di reining

*Ambito IRHA / FISE --- Italia*

**Product Requirements Document (PRD) --- v1.0**

Documento di specifiche di prodotto

Preparato da TonettiMedia --- Giugno 2026

Indice

1\. Executive Summary

PenRunner è una piattaforma web per la gestione completa delle
competizioni di reining in Italia, dall\'organizzazione dell\'evento
alla pubblicazione dei risultati. Si posiziona come alternativa moderna
a ShowManager, con particolare attenzione all\'esperienza delle scuderie
(iscrizioni massive), allo scoring mobile dei giudici e ai risultati
live accessibili al pubblico.

Il prodotto serve quattro tipologie principali di utente: organizzatori
di eventi, concorrenti (rider e owner), scuderie/coach che gestiscono
molti cavalli, e il pubblico che segue eventi e classifiche. Giudici e
segreteria operano come ruoli operativi durante la gara.

**Modello di business.**

La piattaforma è gratuita per tutti gli utenti. La monetizzazione
avviene tramite una fee per cavallo iscritto (default 15 €), concordata
con l\'organizzatore dell\'evento, che la include nei costi di
iscrizione. In MVP l\'incasso resta all\'organizzatore, che rendiconta e
versa a PenRunner il dovuto; il pagamento dell\'intero evento
direttamente in piattaforma è previsto in Fase 2. Il ricavo scala con il
volume reale di iscrizioni.

2\. Obiettivi e contesto

2.1 Problema

Gli strumenti attuali per la gestione delle gare di reining presentano
frizioni note: iscrizione macchinosa per le scuderie con molti binomi,
inserimento punteggi non ottimizzato per dispositivi mobili in campo, e
scarsa visibilità pubblica in tempo reale dei risultati. Spesso
l\'organizzatore lavora con fogli di calcolo paralleli e comunicazioni
manuali.

2.2 Obiettivi di prodotto

-   Ridurre il tempo di iscrizione di una scuderia con 10+ cavalli sotto
    i 5 minuti.

-   Permettere lo scoring per manovra da tablet/smartphone, anche
    offline, con sincronizzazione automatica.

-   Pubblicare classifiche e risultati live consultabili da chiunque
    senza registrazione.

-   Centralizzare il calendario nazionale degli eventi di reining
    (futuri e passati).

-   Automatizzare draw order, payout e produzione documenti (start list,
    results, attestati).

2.3 Non-obiettivi (fuori scope v1)

-   Gestione di discipline diverse dal reining (es. western pleasure,
    cutting).

-   Streaming video integrato delle prove.

-   Sistema di pagamento proprietario: in v1 si integra con provider
    esterni.

-   App native iOS/Android dedicate (la v1 è web responsive / PWA).

3\. Utenti e personas

  ------------------------------------------------------------------------
  **Ruolo**       **Descrizione**           **Bisogni principali**
  --------------- ------------------------- ------------------------------
  Organizzatore   Comitato organizzatore o  Creare evento, definire classi
                  circolo che ospita lo     IRHA, gestire iscrizioni e
                  show                      pagamenti, scoring,
                                            classifiche, payout, documenti

  Concorrente     Rider e/o owner tesserato Iscriversi a una o più classi,
                                            gestire i propri cavalli,
                                            pagare, vedere orari e
                                            risultati, storico punti

  Scuderia /      Centro che iscrive molti  Iscrizione massiva, gestione
  Coach           binomi                    deleghe rider/owner, riepilogo
                                            costi e orari, dashboard unica

  Pubblico        Spettatori, appassionati, Calendario eventi, live
                  famiglie                  scoring, classifiche, ricerca
                                            per cavallo/cavaliere/scuderia

  Giudice         Giudice IRHA/FISE         Inserire punteggi per manovra
                  accreditato               e penalità da mobile, anche
                                            offline, validare gli score

  Segreteria      Staff di gara             Check-in, gestione draw order,
                                            correzioni, emissione
                                            documenti e classifiche
                                            ufficiali
  ------------------------------------------------------------------------

4\. Requisiti funzionali

4.1 Gestione eventi (Organizzatore)

-   Creazione evento con anagrafica: nome, sede/circolo, date, tipologia
    (show interregionale, trofeo, finale), regolamento allegato.

-   Configurazione classi IRHA (es. Open, Non Pro, Limited Non Pro,
    Novice Horse, Youth, Green/Beginners, ecc.) con quote di iscrizione
    e montepremi per classe.

-   **Set pattern ufficiale:** i pattern selezionabili per ogni classe
    derivano dal Rulebook/Patternbook IRHA ufficiale (allineato allo
    standard NRHA), mantenuto come catalogo aggiornato in piattaforma
    stagione per stagione.

-   Impostazione della fee PenRunner per cavallo, inclusa
    automaticamente nel costo di iscrizione mostrato al concorrente.

-   Gestione multi-arena e più giornate, con assegnazione classi a
    campo/sessione.

-   Apertura/chiusura iscrizioni con scadenze e gestione late entry.

4.2 Iscrizioni

-   Wizard di iscrizione singola: selezione cavallo + cavaliere +
    classe/i, con controllo requisiti (tesseramento, idoneità classe).

-   Iscrizione massiva per scuderie: griglia per iscrivere più binomi a
    più classi in un\'unica operazione, con riepilogo costi in tempo
    reale.

-   Gestione deleghe: una scuderia può iscrivere per conto di
    rider/owner collegati.

-   Carrello e checkout con calcolo automatico di quote classi + fee per
    cavallo + eventuali extra (box, energia, late fee).

-   Conferma iscrizione via email con riepilogo e documento PDF.

4.3 Anagrafiche

-   **Cavalli:** nome, microchip, passaporto/UELN, tesseramento
    IRHA/FISE, pedigree essenziale, owner, foto.

-   **Persone:** rider e owner con tesseramento, categoria (Pro/Non
    Pro), contatti, scuderia di appartenenza.

-   **Scuderie:** anagrafica, membri collegati, cavalli gestiti,
    referente.

4.4 Draw order e run order

-   Generazione automatica dell\'ordine di partenza per classe, con
    possibilità di sorteggio o ordine manuale.

-   Gestione go/split per classi numerose e draw separati per giudice
    quando previsto.

-   Riordino drag-and-drop con ricalcolo orari stimati di entrata in
    campo.

4.5 Scoring (Giudice / Segreteria)

-   Inserimento punteggio per manovra secondo lo standard reining
    definito dal Patternbook IRHA/NRHA: valutazione da -1½ a +1½ per
    ciascuna delle manovre del pattern.

-   Gestione penalità (mezzo punto, 1 punto, 2 punti, 5 punti, score 0,
    no score) secondo regolamento IRHA/NRHA.

-   Calcolo automatico dello score finale partendo da 70 e media dei
    giudici quando previsto.

-   Modalità offline-first su tablet con sincronizzazione automatica al
    rientro della connessione.

-   Validazione e firma dello score da parte del giudice prima della
    pubblicazione.

4.6 Classifiche, payout e risultati

-   Classifiche live aggiornate man mano che gli score vengono validati.

-   Gestione tie-break secondo regolamento.

-   Calcolo automatico del payout in base a montepremi e numero di
    paganti per classe.

-   Storico risultati per evento, per cavallo, per cavaliere e per
    scuderia; calcolo punti stagionali.

-   Export PDF/CSV di start list, results ufficiali e riepiloghi payout.

4.7 Calendario e portale pubblico

-   Calendario nazionale degli eventi reining, con filtri per data,
    regione e livello.

-   Pagina pubblica evento con start list, live scoring e classifiche,
    accessibile senza registrazione.

-   Ricerca trasversale per cavallo, cavaliere e scuderia con relativo
    storico.

-   Condivisione social dei risultati.

5\. Requisiti non funzionali

  -----------------------------------------------------------------------
  **Categoria**       **Requisito**
  ------------------- ---------------------------------------------------
  Performance         Live scoring propagato al pubblico entro pochi
                      secondi dalla validazione del giudice.

  Offline             L\'app giudice deve funzionare senza rete e
                      sincronizzare senza perdita dati (conflict
                      resolution).

  Disponibilità       Uptime elevato nei giorni di gara; finestre di
                      manutenzione fuori dai weekend di show.

  Sicurezza           Ruoli e permessi granulari; dati personali gestiti
                      secondo GDPR; audit log sulle modifiche agli score.

  Privacy             Dati tesseramento e anagrafici trattati secondo
                      GDPR, con consensi espliciti.

  Usabilità           Iscrizione massiva e scoring ottimizzati per touch;
                      portale pubblico responsive.

  Scalabilità         Gestione di eventi con centinaia di binomi e picchi
                      di traffico pubblico durante le finali.

  Localizzazione      Interfaccia in italiano; terminologia reining
                      IRHA/FISE; valuta in euro.
  -----------------------------------------------------------------------

6\. Modello di business e flusso pagamenti

Il ricavo deriva esclusivamente da una fee per cavallo iscritto.
L\'organizzatore concorda la fee con PenRunner e la incorpora nel costo
di iscrizione dell\'evento; il concorrente paga un\'unica quota in cui
la fee è già inclusa. Tutte le altre funzionalità --- per concorrenti,
scuderie e pubblico --- sono gratuite.

6.1 Flusso di pagamento (MVP)

Nel modello MVP l\'incasso resta in capo all\'organizzazione: il
concorrente/la scuderia paga l\'organizzatore, che successivamente
rendiconta e versa a PenRunner il dovuto in base ai cavalli
effettivamente iscritti. La piattaforma non gestisce direttamente
l\'incasso del concorrente in questa fase.

-   PenRunner calcola e traccia il numero di cavalli iscritti per
    evento e il relativo importo fee maturato.

-   L\'organizzatore riceve una reportistica chiara (cavalli iscritti ×
    fee) da riconciliare e saldare a PenRunner.

-   La quota di iscrizione mostrata al concorrente include già la fee,
    in modo trasparente o aggregato secondo la scelta
    dell\'organizzatore.

  -----------------------------------------------------------------------
  **Aspetto**             **Meccanismo**          **Note**
  ----------------------- ----------------------- -----------------------
  Chi paga la fee         Concorrente/scuderia    Inclusa nella quota
                          all\'iscrizione         dell\'evento

  Chi incassa (MVP)       L\'organizzatore        Poi versa a PenRunner
                                                  il dovuto

  Chi imposta             Organizzatore in setup  Default 15 €,
                          evento                  concordato con
                                                  PenRunner

  Base di calcolo         Per cavallo iscritto    Indipendente dal numero
                                                  di classi

  Rendicontazione         Report cavalli × fee a  Riconciliazione
                          PenRunner              periodica

  Costo per altri ruoli   Nessuno                 Gratuito per
                                                  concorrenti, scuderie,
                                                  pubblico
  -----------------------------------------------------------------------

6.2 Evoluzione pagamenti (Fase 2)

In fase 2 si valuta l\'introduzione del pagamento dell\'intera
iscrizione direttamente in piattaforma al momento dell\'iscrizione, con
la fee PenRunner trattenuta automaticamente all\'origine (split
payment) e il resto accreditato all\'organizzatore. Questo riduce la
rendicontazione manuale e velocizza i flussi, ma richiede
l\'integrazione di un provider di pagamento, scelta rinviata a quella
fase.

**Implicazione di prodotto.**

Poiché il ricavo è legato al volume di cavalli iscritti, il prodotto
deve massimizzare l\'adozione da parte degli organizzatori e rendere
l\'iscrizione il più fluida possibile: ogni frizione nel funnel di
iscrizione ha impatto diretto sui ricavi.

7\. Roadmap per fasi

  ------------------------------------------------------------------------
  **Fase**    **Focus**                  **Contenuto**
  ----------- -------------------------- ---------------------------------
  MVP         Ciclo gara completo        Eventi, iscrizioni (singola +
                                         bulk), anagrafiche, draw order,
                                         scoring, classifiche, portale
                                         pubblico base, fee per cavallo
                                         con incasso organizzatore e
                                         rendicontazione

  Fase 2      Esperienza, automazione e  Pagamento intero evento in
              pagamenti                  piattaforma con split payment
                                         della fee, scoring offline-first
                                         robusto, payout avanzato,
                                         documenti PDF, punti stagionali,
                                         ricerca pubblica avanzata

  Fase 3      Ecosistema                 PWA/app, integrazioni
                                         tesseramento federale,
                                         statistiche e analytics,
                                         condivisione social, multi-evento
                                         per circuiti
  ------------------------------------------------------------------------

8\. Metriche di successo

-   Numero di eventi creati e percentuale che arriva a gara conclusa
    sulla piattaforma.

-   Cavalli iscritti per evento (driver diretto dei ricavi).

-   Tempo medio di iscrizione di una scuderia con 10+ binomi.

-   Tasso di errore/correzione manuale degli score.

-   Visitatori unici del portale pubblico durante gli eventi.

-   Tasso di ritorno degli organizzatori (eventi ripetuti).

9\. Questioni aperte

1.  Quali classi e relativi pattern del Patternbook IRHA includere nel
    catalogo iniziale della stagione corrente, e con quale cadenza
    aggiornarli.

2.  Provider di pagamento da integrare in Fase 2 per il pagamento intero
    evento e lo split payment della fee (decisione rinviata).

3.  Modalità di rendicontazione e riconciliazione della fee con gli
    organizzatori in MVP (periodicità, formato report, scadenze di
    versamento).

4.  Integrazione diretta con i database di tesseramento IRHA/FISE o
    inserimento manuale in v1.

5.  Gestione dei circuiti/campionati regionali con punteggi cumulativi:
    in MVP o fase successiva.
