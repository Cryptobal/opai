/**
 * |lectura − ledger| ≥ este valor exige nota al registrar la lectura y pinta
 * la diferencia como advertencia. Cualquier delta ≠ 0 se reporta igual.
 */
export const DEFAULT_BANK_BALANCE_DISCREPANCY_THRESHOLD_CLP = 100_000;

/** Categoría de los movimientos "Ajuste de cuadratura" (visibles y auditables). */
export const BANK_LEDGER_ADJUSTMENT_CATEGORY = "AJUSTE_CUADRATURA";

export const BANK_BALANCE_SOURCE_LABEL = {
  OPENING: "Saldo inicial",
  MANUAL: "Lectura manual",
  IMPORT: "Cartola",
  CALCULATED: "Proveedor",
} as const;

export type BankBalanceSourceKey = keyof typeof BANK_BALANCE_SOURCE_LABEL;

export function bankBalanceSourceLabel(source: string | null | undefined): string {
  if (!source) return "Sin saldo inicial";
  if (source in BANK_BALANCE_SOURCE_LABEL) {
    return BANK_BALANCE_SOURCE_LABEL[source as BankBalanceSourceKey];
  }
  return source;
}
