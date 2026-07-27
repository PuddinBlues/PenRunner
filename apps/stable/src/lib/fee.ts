// ---------------------------------------------------------------------------
// Stima LIVE della quota mentre si compone la griglia (BR-01: fee per cavallo
// DISTINTO, non per iscrizione). È solo il display in tempo reale: alla
// conferma FA FEDE la quote del server — se divergono è un bug, e il test
// sul caso 215 € del prototipo li tiene allineati.
// ---------------------------------------------------------------------------

export interface FeeItem {
  horseId: string;
  classId: string;
}

export interface FeeBreakdown {
  enrollments: number;
  classesCost: number;
  horses: number; // cavalli distinti
  fee: number;
  total: number;
}

export function computeFeeBreakdown(
  items: FeeItem[],
  classFees: Record<string, number>,
  feePerHorse: number,
): FeeBreakdown {
  const classesCost = items.reduce(
    (sum, i) => sum + (classFees[i.classId] ?? 0),
    0,
  );
  const horses = new Set(items.map((i) => i.horseId)).size;
  const fee = horses * feePerHorse;
  return {
    enrollments: items.length,
    classesCost,
    horses,
    fee,
    total: classesCost + fee,
  };
}
