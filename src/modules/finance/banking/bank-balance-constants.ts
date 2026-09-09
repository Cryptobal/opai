/** |reportado − calculado| ≥ este valor dispara notificación de discrepancia. */
export const DEFAULT_BANK_BALANCE_DISCREPANCY_THRESHOLD_CLP = 100_000;

export const BANK_BALANCE_SOURCE_LABEL = {
  MANUAL: "Manual",
  IMPORT: "Cartola",
  CALCULATED: "Fintoc",
} as const;

export type BankBalanceSourceKey = keyof typeof BANK_BALANCE_SOURCE_LABEL;

export function bankBalanceSourceLabel(source: string | null | undefined): string {
  if (!source) return "Sin ancla";
  if (source in BANK_BALANCE_SOURCE_LABEL) {
    return BANK_BALANCE_SOURCE_LABEL[source as BankBalanceSourceKey];
  }
  return source;
}
