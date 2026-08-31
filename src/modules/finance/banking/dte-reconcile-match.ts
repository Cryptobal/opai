/**
 * Ranking y elegibilidad de DTEs para conciliación bancaria.
 *
 * Puro (sin Prisma): lo usan el service, la UI del drawer y los tests.
 * Un borrador nunca es candidato — solo facturas emitidas (folio > 0).
 */

/** Tolerancia en CLP para considerar match exacto de monto. */
export const RECONCILE_AMOUNT_MATCH_TOLERANCE_CLP = 1;

export type DteAmountMatchFields = {
  amountPending: number;
  total: number;
};

export type DteReconcileRankFields = DteAmountMatchFields & {
  issuedAt: string;
};

export type DteReconcileEligibilityFields = {
  siiStatus: string;
  folio: number;
  voidedByCreditNoteId?: string | null;
  dteType?: number | null;
};

function absDelta(a: number, b: number): number {
  return Math.abs(a - b);
}

/** Menor distancia entre el banco y (pendiente | total) del DTE. */
export function dteAmountMatchDelta(
  bankAbs: number,
  dte: DteAmountMatchFields,
): number {
  return Math.min(
    absDelta(dte.amountPending, bankAbs),
    absDelta(dte.total, bankAbs),
  );
}

export function isExactDteAmountMatch(
  bankAbs: number,
  dte: DteAmountMatchFields,
): boolean {
  return dteAmountMatchDelta(bankAbs, dte) <= RECONCILE_AMOUNT_MATCH_TOLERANCE_CLP;
}

/**
 * 0 = pendiente calza el banco (el match que el usuario espera ver primero).
 * 1 = el total calza (p. ej. UNPAID con pending=total, o PARTIAL cuyo bruto coincide).
 * 2 = sin calce exacto.
 */
export function dteAmountMatchTier(
  bankAbs: number,
  dte: DteAmountMatchFields,
): 0 | 1 | 2 {
  if (absDelta(dte.amountPending, bankAbs) <= RECONCILE_AMOUNT_MATCH_TOLERANCE_CLP) {
    return 0;
  }
  if (absDelta(dte.total, bankAbs) <= RECONCILE_AMOUNT_MATCH_TOLERANCE_CLP) {
    return 1;
  }
  return 2;
}

/**
 * Match exacto primero (pendiente, luego total), después afinidad de monto,
 * después fecha de emisión descendente.
 */
export function compareDteCandidatesByAmountMatch<T extends DteReconcileRankFields>(
  bankAbs: number,
  a: T,
  b: T,
): number {
  const tierA = dteAmountMatchTier(bankAbs, a);
  const tierB = dteAmountMatchTier(bankAbs, b);
  if (tierA !== tierB) return tierA - tierB;
  const deltaA = dteAmountMatchDelta(bankAbs, a);
  const deltaB = dteAmountMatchDelta(bankAbs, b);
  if (deltaA !== deltaB) return deltaA - deltaB;
  return b.issuedAt.localeCompare(a.issuedAt);
}

export function sortDteCandidatesByAmountMatch<T extends DteReconcileRankFields>(
  candidates: T[],
  bankAbs: number,
): T[] {
  return [...candidates].sort((a, b) =>
    compareDteCandidatesByAmountMatch(bankAbs, a, b),
  );
}

export function isDteEligibleForBankReconcile(
  dte: DteReconcileEligibilityFields,
): boolean {
  return dteIneligibleReconcileReason(dte) === null;
}

/** Mensaje de error si el DTE no se puede conciliar; null si es elegible. */
export function dteIneligibleReconcileReason(
  dte: DteReconcileEligibilityFields,
): string | null {
  if (dte.siiStatus === "DRAFT" || dte.folio <= 0) {
    return "No se puede conciliar contra un borrador. Emití la factura al SII primero.";
  }
  if (dte.siiStatus === "ANNULLED" || dte.siiStatus === "REJECTED") {
    return "No se puede conciliar contra un documento anulado o rechazado por el SII.";
  }
  if (dte.voidedByCreditNoteId) {
    return "No se puede conciliar contra una factura anulada por nota de crédito.";
  }
  if (dte.dteType === 56 || dte.dteType === 61) {
    return "No se puede conciliar contra notas de débito o crédito.";
  }
  return null;
}
