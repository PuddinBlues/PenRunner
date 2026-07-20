# Vettori d'oro — scoring PenRunner

Vettori di collaudo per il motore `computeCardScore` / `combineCards` (packages/core),
tutti da score card REALI con totale verificato al mezzo punto.

## File

- `futurity_showmanager_clean.json` — 13 vettori dall'output ufficiale ShowManager
  del NRHA EuroFuturity 2026 (Pattern 10). Solo carte-giudice con calcolo verificato
  == totale dichiarato e senza penalità di manovra (le più solide). Include 1 scratch.
  **Valore speciale: parità competitiva** — sono i punteggi ufficiali che ShowManager
  produce oggi; il motore PenRunner deve riprodurli identici.

- `scorecards_reali_foto.json` — vettori da score card cartacee firmate (tappe Lombardia
  2025): card canarino Pattern 6 (già usata nel seed) e uno scratch reale.

- `multigiudice_br24.json` — 2 vettori per la regola BR-24 (5 giudici, esclude alto/basso):
  1) card reale 5 giudici con **parità sul minimo** (due 66,5 → se ne esclude UNO solo):
     perCard [67.5,66.5,67,68,66.5] → tenuti [66.5,67,67.5] → run 201.0
  2) Futurity DRAW 1: totali [69,67.5,69,69,68.5] → tenuti [68.5,69,69] → run 206.5

## Note per l'estensione
Nel PDF Futurity ci sono altre ~74 carte-giudice pulite e ~38 con penalità di manovra
sulla riga PENALTY (½, 1, 2 su singola manovra) che il parser di testo non aggancia
con certezza dal layout a colonne. NON incluse per prudenza: un vettore con input
mal letto è peggio di nessun vettore. Vanno confermate a vista prima di aggiungerle
(il totale ufficiale c'è, quindi sono recuperabili una a una).
