# PenRunner — passaggio di consegne (chat 5)

*Chiusura sessione 4, 31 luglio 2026. Da incollare/allegare all'apertura della chat nuova.*

---

## 1. Chi sono e come lavoriamo

Marco Tonetti, product owner non tecnico. In questa chat Claude fa **advisor di prodotto e design**; lo sviluppo lo fa Claude Code sul repo. Metodo **postino**: i messaggi per Code si scrivono qui pronti da incollare, i piani di Code tornano qui per il setaccio.

Tono richiesto: PO-to-PO, decisioni nette, bozze pronte, niente liste di opzioni quando serve una scelta. Marco corregge in fretta e si aspetta che l'errore non si ripeta.

**Patto con Code (nel CLAUDE.md):** Classe A = fix ovvi e reversibili in autonomia con riepilogo a valle; Classe B = BR, schema, auth, denaro, deploy, superfici nuove → piano breve + ok esplicito. In dubbio: B.

---

## 2. Dove sta il prodotto

PenRunner: piattaforma web per le gare di reining IRHA/FISE. MVP completo (356 test), deploy vivo — Railway API, Vercel `penrunner.com`, Neon, Resend. Restano 3 Worker Cloudflare e i DNS finali.

Repo pubblico: **PuddinBlues/PenRunner**.

---

## 3. Il lavoro in corso: pitch IRHA

**Interlocutrice: Cristina Serra**, gestisce la parte software di IRHA. IRHA è già in parola con un fornitore a pagamento; Marco ha proposto PenRunner gratis e lei era incredula. Obiettivo del deck: mostrarle il costruito e ottenere l'avvio del percorso di approvazione.

Priorità dichiarate da Cristina: **integrazione banca dati IRHA, privacy, solo alcuni dati agli organizzatori**.

### Stato: deck a 17 slide, consegnato

`PenRunner_Pitch_IRHA.html` è il **formato canonico** (HTML self-contained: frecce/click/swipe, contatore, hash per slide) + `PenRunner_Pitch_IRHA.pdf` gemello.

| # | Slide |
|---|---|
| 1 | Copertina |
| 2 | Organizzare una gara oggi (~20 giorni, 5 rifacimenti del conto) |
| 3 | Cos'è PenRunner |
| 4 | La federazione al sicuro (banca dati, privacy, ruoli) |
| **5** | **La home del portale** — prima schermata mostrata |
| 6 | Regia organizzatori |
| 7 | Il draw che si sistema da solo |
| 8 | Scuderie |
| 9 | Cavalieri |
| 10 | Giudici e scribe (schermata scoring intera) |
| 11 | Diretta + classifiche coi giudici in chiaro |
| 12 | Maxi schermo |
| 13 | Costruito sulle regole del reining italiano |
| 14 | Tappa pilota in 3 passi |
| 15 | Il modello (gratis → 15 € a cavaliere per gara) |
| 16 | Cosa chiediamo a IRHA (3 ask) |
| 17 | Parliamone |

---

## 4. Regole del deck — non violarle

1. **Le schermate NON si inventano.** Ogni mock nel deck è trascritto fedelmente dai prototipi reali (`prototypes/*.jsx|tsx`). Prima di toccare una slide-schermata: aprire il prototipo e copiarne copy, stati e numeri.
2. **Una schermata rimpicciolita non è una schermata mostrata.** Le superfici demo vogliono slide dedicate, a piena larghezza. Il francobollo in fondo a una slide di testo è stato bocciato.
3. **Frase bandita: "fatta da chi corre"** (Marco ha venduto il cavallo). Si dice "nata da una lunga ricerca sul campo". Grep di controllo a ogni giro.
4. **Modello di prezzo:** gratis finché non adottano davvero, poi **15 € a cavaliere per gara**, come il giudice o il videografo. Nessun canone, nessun costo per la federazione, nessun lock-in.
5. **TonettiMedia** è lo sviluppatore, con 15+ anni di prodotti digitali.

### Decisioni prese sulla home (slide 5)

Solo tre elementi, tutti grandi: **nav → hero 330px → riga CALENDARIO da 4 card**. Niente barra di ricerca, niente filtri regione, niente footer, niente seconda riga: schiacciavano tutto. Hero con `object-position: center 45%` per tenere l'azione sopra la fascia del titolo. Foto reali dei prototipi + logo Lombardia Reining su fondo bianco per le tappe LR.

**Trappola scoperta:** nel set foto dei prototipi `F_ARENA` e `F_HERO2` sono **la stessa immagine** in due risoluzioni. Usarne una sola. Disponibili e distinte: F_LIVE, F_PREMI, F_ARENA, F_SPIN, F_COPERTO, F_SABBIA, F_STOP.

### Giudici

Nelle gare importanti sono **cinque**. La classifica (slide 11) mostra G1…G5 con il più alto e il più basso **barrati** e il totale che somma i tre restanti. La slide 13 dice "uno, tre o cinque giudici secondo l'importanza della gara".

> **APERTO — da confermare con Marco/IRHA:** che lo scarto alto-basso a cinque giudici sia la regola corretta e che il totale sia una *somma* e non una media. Se cambia, si aggiornano cinque righe di numeri e due note.

---

## 5. Come si rigenera il deck (pipeline)

L'ambiente si resetta tra le sessioni: la pipeline va ricostruita, il repo no.

```python
# PDF gemello — playwright + chromium in print mode
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width":1440,"height":810})
    pg.goto("file:///percorso/deck.html"); pg.wait_for_timeout(900)
    pg.emulate_media(media="print")
    pg.pdf(path="PenRunner_Pitch_IRHA.pdf", width="1440px", height="812px",
           print_background=True, margin={"top":"0","bottom":"0","left":"0","right":"0"})
```

**Controlli obbligatori prima di consegnare** (l'occhio non basta, gli screenshot in chat a volte non si vedono):

- validare la struttura HTML (tag aperti/chiusi);
- per ogni slide toccata: `innerText` per verificare i contenuti e un giro sul DOM per gli elementi che sfondano il bordo della slide;
- `pdftotext -layout` e leggere **pagina per pagina** che ci sia davvero ciò che si è promesso;
- `pdfimages -list` per confermare le foto incorporate;
- grep della frase bandita.

---

## 6. Norma anti-perdite (decisa da Marco, da scolpire nel CLAUDE.md)

**Nessun artefatto vive solo in chat.** Ogni artefatto ratificato si committa nel repo nello stesso giro: `prototypes/` per i JSX/TSX, `pitch/` per le presentazioni, `docs/design/` per REGOLE-DESIGN.md e MAPPA-UX.md. Gli zip per terzi si generano dal repo, mai a mano.

`PenRunner_commit_design.zip` è **pronto da consegnare a Code** e contiene: 7 prototipi (incluso OrganizerRegia v4), deck HTML + PDF, REGOLE-DESIGN.md, MAPPA-UX.md. Il messaggio per Code con la norma è già stato scritto in chat 4 — se non è ancora stato incollato, va fatto.

---

## 7. Da fare, in ordine

1. **Confermare la regola dei cinque giudici** (scarto + somma) e allineare il deck.
2. **Committare lo zip** via Code sotto la norma anti-perdite.
3. Licenze delle foto: Marco le sta regolarizzando. Il markup della home è pronto per lo scambio, sono cinque minuti.
4. Eventuale ritocco dell'inquadratura orizzontale dell'hero (il dettaglio della foto pende a destra).
5. Preparare l'incontro con Cristina: la demo dal vivo accompagna le slide-schermata.
6. In coda dal prodotto: modulo box/paytime/preiscrizioni, import banca dati IRHA, admin panel di piattaforma, pacchetto Sara finale (regola: un pacchetto solo, prima della prossima presentazione).

---

## 8. Cosa allegare aprendo la chat nuova

- `PenRunner_Pitch_IRHA.html` (il deck canonico — senza questo non si può iterare)
- `PenRunner_commit_design.zip` (prototipi + docs di design + deck)
- questo documento

I prototipi si possono anche riclonare dal repo pubblico, ma **OrganizerRegia v4** vive solo nello zip: nel repo c'era la v3.
