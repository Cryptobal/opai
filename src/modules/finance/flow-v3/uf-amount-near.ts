/**
 * ¿El cargo bancario está cerca del CLP esperado de una recurrencia UF?
 * Puro: classify siempre usa RUT/glosa; esto solo decide "monto similar".
 */

export const UF_AMOUNT_NEAR_PCT = 0.05;

export function ufAmountToleranceClp(
  expectedClp: number,
  matchAmountToleranceClp = 5_000,
): number {
  const mag = Math.abs(expectedClp);
  return Math.max(matchAmountToleranceClp, Math.round(mag * UF_AMOUNT_NEAR_PCT));
}

export function isAmountNearUfExpected(
  bankAmountClp: number,
  expectedClp: number,
  matchAmountToleranceClp = 5_000,
): boolean {
  if (!Number.isFinite(bankAmountClp) || !Number.isFinite(expectedClp)) return false;
  if (expectedClp === 0) return false;
  const delta = Math.abs(Math.abs(bankAmountClp) - Math.abs(expectedClp));
  return delta <= ufAmountToleranceClp(expectedClp, matchAmountToleranceClp);
}

export interface UfOccurrenceExpected {
  /** CLP esperado de la ocurrencia (UF × valor UF). */
  expectedClp: number;
  occurrenceYmd: string;
}

/** Elige la ocurrencia cuya fecha está más cerca de la del movimiento. */
export function pickNearestUfExpected(
  txYmd: string,
  occurrences: UfOccurrenceExpected[],
): UfOccurrenceExpected | null {
  if (occurrences.length === 0) return null;
  let best = occurrences[0]!;
  let bestDist = Math.abs(ymdOrd(txYmd) - ymdOrd(best.occurrenceYmd));
  for (let i = 1; i < occurrences.length; i++) {
    const cur = occurrences[i]!;
    const dist = Math.abs(ymdOrd(txYmd) - ymdOrd(cur.occurrenceYmd));
    if (dist < bestDist) {
      best = cur;
      bestDist = dist;
    }
  }
  return best;
}

function ymdOrd(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1);
}
