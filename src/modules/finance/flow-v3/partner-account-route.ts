/**
 * Polaridad aporte/devolución socios cuando comparten cuenta (Acreedores Varios).
 * Puro: sin prisma.
 *
 *   abono (+) → APORTE_SOCIO
 *   cargo (−) → DEVOL_PRESTAMO_SOCIO
 */
export interface PartnerRouteCandidate {
  rowId: string;
  canonicalKey: string | null;
}

/** Resuelve fila de financiamiento socio por signo del movimiento bancario. */
export function resolvePartnerSocioRow(
  candidates: PartnerRouteCandidate[] | undefined,
  isCredit: boolean,
): string | null {
  if (!candidates || candidates.length === 0) return null;
  const aporte = candidates.find((c) => c.canonicalKey === "APORTE_SOCIO");
  const devol = candidates.find((c) => c.canonicalKey === "DEVOL_PRESTAMO_SOCIO");
  if (!aporte && !devol) return null;
  if (isCredit) return aporte?.rowId ?? null;
  return devol?.rowId ?? aporte?.rowId ?? null;
}

/** ¿Algún candidato es renglón de aporte/devolución socios? */
export function hasPartnerSocioPair(candidates: PartnerRouteCandidate[] | undefined): boolean {
  if (!candidates) return false;
  let aporte = false;
  let devol = false;
  for (const c of candidates) {
    if (c.canonicalKey === "APORTE_SOCIO") aporte = true;
    if (c.canonicalKey === "DEVOL_PRESTAMO_SOCIO") devol = true;
  }
  return aporte || devol;
}
