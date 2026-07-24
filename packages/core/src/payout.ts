// ---------------------------------------------------------------------------
// Payout (BR-31, BR-34 go-singolo, flusso I): vista DERIVATA, mai memorizzata.
// Aritmetica interamente in CENTESIMI interi — niente float sui soldi.
// Invariante non negoziabile: distribuito + non_distribuito = purse, sempre,
// al centesimo. Nessun centesimo creato o perso.
//
// Formula del montepremi CONFERMATA da ART. 15 Reg. Disciplina Reining
// FISE/IRHA 2025 (verbatim in reference/art15-montepremi.md): iscrizioni +
// added money − trofei − 20% spese org.; con <4 partecipanti il trofeo non
// si detrae; Payback A obbligatorio. UNICO residuo parametrico: la BASE del
// 20% (qui: sole iscrizioni) — il testo non la precisa, si chiude con la
// segreteria. Il report mostra sempre la scomposizione.
// ---------------------------------------------------------------------------

export const ORG_EXPENSE_RATE = 0.2; // 20% spese org. (ART. 15; base: iscrizioni*)

export interface PurseComponents {
  entryFeesCents: number;
  addedMoneyCents: number;
  trophyDeductionCents: number;
  orgExpenseCents: number;
  purseCents: number;
}

export function computePurse(input: {
  confirmedEntries: number; // scratch inclusi (BR-03/BR-33)
  entryFeeCents: number;
  addedMoneyCents: number;
  trophyCostCents: number;
  orgExpenseRate?: number;
}): PurseComponents {
  const rate = input.orgExpenseRate ?? ORG_EXPENSE_RATE;
  const entryFeesCents = input.confirmedEntries * input.entryFeeCents;
  const orgExpenseCents = Math.round(entryFeesCents * rate);
  // Handbook: categorie con meno di 4 partecipanti → trofeo non detratto.
  const trophyDeductionCents =
    input.confirmedEntries >= 4 ? input.trophyCostCents : 0;
  const purseCents =
    entryFeesCents + input.addedMoneyCents - trophyDeductionCents - orgExpenseCents;
  return {
    entryFeesCents,
    addedMoneyCents: input.addedMoneyCents,
    trophyDeductionCents,
    orgExpenseCents,
    purseCents: Math.max(0, purseCents),
  };
}

// --- Payback A (da reference/payback-schedules.json) ------------------------

// Forma 1:1 di reference/payback-schedules.json (nessuna trasformazione).
export interface PaybackBand {
  horses_entered: string;
  places_paid: number;
  /** percentuali per posizione, come da tabella (somma 100) */
  percentages: Record<string, number>;
}

/** Interpreta "1", "2-5", "61+" e sceglie la fascia per n. cavalli iscritti. */
export function selectPaybackBand(
  table: PaybackBand[],
  horsesEntered: number,
): PaybackBand {
  for (const band of table) {
    const spec = band.horses_entered;
    if (spec.endsWith("+")) {
      if (horsesEntered >= parseInt(spec, 10)) return band;
    } else if (spec.includes("-")) {
      const [lo, hi] = spec.split("-").map((s) => parseInt(s, 10));
      if (horsesEntered >= lo! && horsesEntered <= hi!) return band;
    } else if (horsesEntered === parseInt(spec, 10)) {
      return band;
    }
  }
  // oltre l'ultima fascia esplicita: usa l'ultima (la "61+")
  return table[table.length - 1]!;
}

// --- Distribuzione ----------------------------------------------------------

/** Un gruppo di piazzamento: uno o più binomi a pari merito su un rango. */
export interface Placement<Ref> {
  rank: number;
  refs: Ref[]; // >1 = pari merito su questo rango
}

export interface PayoutPlacement<Ref> {
  rank: number;
  refs: Ref[];
  /** posizioni della tabella occupate da questo piazzamento */
  positions: number[];
  /** importo totale del gruppo (centesimi) */
  amountCents: number;
  /** importo per ciascun binomio del gruppo (pari merito diviso) */
  perRefCents: number[];
}

export interface PayoutResult<Ref> {
  placesPaid: number;
  placements: PayoutPlacement<Ref>[];
  distributedCents: number;
  /** posizioni pagate senza un piazzato eligibile → resta allo show management */
  undistributedCents: number;
  purseCents: number;
}

/**
 * Distribuisce `purseCents` per posizione (largest remainder), così che la
 * somma su TUTTE le posizioni pagate = purse esatto. Poi raggruppa per
 * piazzamento (pari merito) e lascia non distribuite le posizioni senza
 * piazzato eligibile.
 */
export function computePayout<Ref>(input: {
  purseCents: number;
  band: PaybackBand;
  /** solo piazzamenti ELIGIBILI (score_0/no_score già esclusi), in ordine */
  placements: Placement<Ref>[];
}): PayoutResult<Ref> {
  const { purseCents, band } = input;
  const k = band.places_paid;

  // importo per singola posizione della tabella, in centesimi, quadrato al purse
  const posAmounts = largestRemainder(
    purseCents,
    Array.from({ length: k }, (_, i) => band.percentages[String(i + 1)] ?? 0),
  );

  const placements: PayoutPlacement<Ref>[] = [];
  let cursor = 0; // prossima posizione tabella (0-based)
  let distributed = 0;

  for (const p of input.placements) {
    if (cursor >= k) break; // piazzati oltre le posizioni pagate: fuori dai premi
    const size = p.refs.length;
    const positions: number[] = [];
    let groupTotal = 0;
    for (let i = 0; i < size && cursor < k; i++) {
      positions.push(cursor + 1);
      groupTotal += posAmounts[cursor]!;
      cursor += 1;
    }
    // pari merito: il totale del gruppo diviso equamente tra i refs
    const perRef = splitEqually(groupTotal, size);
    placements.push({
      rank: p.rank,
      refs: p.refs,
      positions,
      amountCents: groupTotal,
      perRefCents: perRef,
    });
    distributed += groupTotal;
  }

  return {
    placesPaid: k,
    placements,
    distributedCents: distributed,
    undistributedCents: purseCents - distributed,
    purseCents,
  };
}

/**
 * Ripartisce `totalCents` secondo `percentages` (che sommano ~100, valori
 * anche frazionari come 8.5). Floor per posizione + resto assegnato per
 * resto-più-grande: la somma torna ESATTA a totalCents.
 */
export function largestRemainder(
  totalCents: number,
  percentages: number[],
): number[] {
  // lavora in millesimi di percentuale per assorbire i decimali (8.5 → 8500)
  const scaled = percentages.map((p) => Math.round(p * 1000));
  const denom = 100 * 1000;
  const exact = scaled.map((s) => (totalCents * s) / denom);
  const floors = exact.map((x) => Math.floor(x));
  let remainder = totalCents - floors.reduce((a, b) => a + b, 0);
  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  const result = [...floors];
  for (let j = 0; j < order.length && remainder > 0; j++) {
    result[order[j]!.i] = (result[order[j]!.i] ?? 0) + 1;
    remainder -= 1;
  }
  return result;
}

/** Divide `totalCents` in `n` parti il più uguali possibile, somma preservata. */
export function splitEqually(totalCents: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(totalCents / n);
  let remainder = totalCents - base * n;
  return Array.from({ length: n }, () => {
    const extra = remainder > 0 ? 1 : 0;
    remainder -= extra;
    return base + extra;
  });
}
