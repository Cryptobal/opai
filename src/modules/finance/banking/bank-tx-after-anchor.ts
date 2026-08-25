/**
 * Corte de movimientos de cartola respecto de un snapshot de saldo.
 *
 * IMPORT = cierre de extracto a asOfDate (el closing ya incluye ese día)
 *   → transactionDate > asOfDate.
 * MANUAL/CALCULATED = ancla / punto en el tiempo. currentBalance y un
 *   snapshot del mismo día NO se asumen dueños de la cartola de ese día
 *   (abonos con fecha valor = hoy, p.ej. API bancaria). MATCHED a un DTE
 *   (incluso borrador folio 0) no cambia esto: la plata ya está en el banco.
 *   → transactionDate >= asOfDate.
 */
export type BalanceAnchorSource = "MANUAL" | "IMPORT" | "CALCULATED";

export function bankTxDateFilterAfterAnchor(
  anchorAsOfDate: Date,
  todayDate: Date,
  anchorSource?: BalanceAnchorSource | null,
): { gt?: Date; gte?: Date; lte: Date } {
  if (anchorSource === "IMPORT") {
    return { gt: anchorAsOfDate, lte: todayDate };
  }
  return { gte: anchorAsOfDate, lte: todayDate };
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
  if (tx > cutoff || tx < asOf) return false;
  if (tx > asOf) return true;
  return args.anchorSource !== "IMPORT";
}
