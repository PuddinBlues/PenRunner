# PenRunner — Design tokens

Palette e regole d'uso, in formato pronto per lo sviluppo. La style guide visiva completa è in `styleguide.html`. Questi token sono già applicati nei prototipi (oggetto `C` in cima a ogni file).

## Principi

Identità "Apple per il rigore, Netflix per lo spettacolo". Due registri:
- **Chiaro** = lavoro (iscrizione, scoring, segreteria). Leggibilità prima di tutto.
- **Scuro** = spettacolo (pagina evento pubblica, live results). Impatto, numeri protagonisti.

Un solo accento (verde sella) tiene insieme i due mondi.

## Colori

### CSS variables

```css
:root {
  /* Brand & accento — solo per azioni di sistema */
  --accent-600: #15803D;   /* verde sella, azione primaria */
  --accent-500: #16A34A;
  --accent-50:  #DCFCE7;

  /* Ink / neutrali (registro chiaro) */
  --ink-900:   #0F172A;
  --slate-700: #334155;
  --slate-500: #64748B;
  --slate-400: #94A3B8;
  --slate-300: #CBD5E1;
  --slate-100: #F1F5F9;
  --slate-50:  #F8FAFC;
  --white:     #FFFFFF;

  /* Registro scuro */
  --dark-bg:    #0B1120;   /* fondo notte */
  --dark-panel: #141C2E;   /* card su fondo scuro */

  /* Stati semantici */
  --success: #15803D;
  --warning: #B45309;      /* penalità */
  --danger:  #B91C1C;      /* no score / errore */
  --info:    #1D4ED8;      /* metadati, note */
  --live:    #DC2626;      /* SOLO "in diretta" — non per errori */

  /* Premium (tier) */
  --gold:       #C8902F;   /* riservato al tier premium */
  --gold-light: #E8B84B;

  /* Raggi */
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
}
```

### Oggetto JS (come usato nei prototipi)

```js
const C = {
  accent: "#15803D", accent500: "#16A34A", accent50: "#DCFCE7",
  ink: "#0F172A", ink900: "#0B1120",
  slate700: "#334155", slate500: "#64748B", slate400: "#94A3B8",
  slate300: "#CBD5E1", slate100: "#F1F5F9", slate50: "#F8FAFC", white: "#FFFFFF",
  warning: "#B45309", danger: "#B91C1C", info: "#1D4ED8", live: "#DC2626",
  gold: "#C8902F", goldLight: "#E8B84B",
};
```

## Regole d'uso (non negoziabili)

- **Verde accento = solo azioni di sistema** (salva, iscrivi, conferma, naviga). Non spargerlo come decorazione.
- **Rosso `#DC2626` = solo "in diretta".** Il pallino live, il badge "IN DIRETTA", il binomio in campo. Mai per errori — quello è danger `#B91C1C`. Sono due significati diversi.
- **Oro `#C8902F` = solo tier premium.** È un segnale semantico ("il massimo livello"). Spargerlo gli toglie forza.
- **Numeri sempre tabulari:** `font-variant-numeric: tabular-nums` su ogni punteggio, importo, data numerica. In un gestionale di gara il numero è il dato re.
- **Score sotto 70** vira in ambra (`--warning`/`#FBBF24` su fondo scuro) per segnalare a colpo d'occhio la run in difficoltà.

## Tema + tier degli eventi

Due dimensioni distinte:
- **Tema** = colore dell'evento, scelto dall'organizzatore (es. Europeo blu+oro). Veste header, badge, accenti di *quell'evento*.
- **Tier** = importanza, che la piattaforma conosce e a cui applica un trattamento crescente.

| Tier | Trattamento |
|------|-------------|
| regionale | card chiara, filo di colore-tema a sinistra |
| nazionale | accento più presente, bordo marcato |
| internazionale | header pieno colore-tema |
| premium | card scura + oro, trattamento cinematografico |

Il **colore di prodotto (verde) resta fisso** sui controlli PenRunner qualunque tema indossi l'evento — è l'ancora che dice "questo è PenRunner".

## Tipografia

- Famiglia: **Inter** (system-ui sans come fallback).
- Scala: Display 30–40/800, Heading 22–26/700, Subhead 16/500, Body 14/400, Caption 12/400.
- Due pesi principali: 400 e 600/700 per enfasi. Cifre tabulari per i numeri.
- Sentence case ovunque. Mai ALL CAPS se non micro-label con letter-spacing.

## Forma

- Raggi: 8px standard, 12px per le card.
- Bordi: sottili, `1px solid rgba(15,23,42,0.08)` su chiaro, `rgba(255,255,255,0.08)` su scuro.
- Niente gradienti decorativi. L'unico gradiente ammesso è l'overlay scuro sulle foto evento.

## Immagini eventi

- Le foto d'azione del reining sono materiale prezioso per il registro scuro.
- **Regola:** ogni foto con testo sopra ha un overlay scuro dal basso (`linear-gradient(to top, #0B1120, transparent)`) che garantisce il contrasto. Funziona con qualsiasi foto carichi l'organizzatore.
- La leggibilità non si negozia con l'estetica.
- Nota: le foto nei prototipi sono segnaposto da eventi reali. In produzione servono immagini con diritti d'uso.
