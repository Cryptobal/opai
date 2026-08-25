/**
 * Corte de movimientos de cartola respecto de un snapshot de saldo.
 *
 * El ancla (IMPORT = cierre de extracto; MANUAL/CALCULATED = saldo pegado
 * de la app del banco) ya incluye las txs de asOfDate. Sumar el mismo día
 * duplica abonos (p. ej. Embajada +24M sobre un ancla de 24,8M).
 *   → transactionDate > asOfDate AND ≤ today.
 */
export type BalanceAnchorSource = "MANUAL" | "IMPORT" | "CALCULATED";

export function bankTxDateFilterAfterAnchor(
  anchorAsOfDate: Date,
  todayDate: Date,
  _anchorSource?: BalanceAnchorSource | null,
): { gt: Date; lte: Date } {
  return { gt: anchorAsOfDate, lte: todayDate };
}

export function includeBankTxAfterAnchor(args: {
  transactionDate: Date;
  anchorAsOfDate: Date;
  asOfDate: Date;
  anchorSource?: BalanceAnchorSource | null;
}): boolean {
  const tx = args.transactionDate.getTime();
  const cutoff = args.asOfDate.getTime();
  const asOf = args.anchorAsOfDate.getTime();
  return tx > asOf && tx <= cutoff;
}
