/**
 * Saldo banco real consolidado a una fecha, calculado con la regla del
 * libro mayor (misma que `bank-balance.service.ts`), de forma independiente
 * por bucket (no acumulativa). Para cada cuenta:
 *
 *   opening = saldo inicial (OPENING) con asOfDate <= atDate
 *   delta   = Σ tx visibles con opening.asOfDate < transactionDate <= atDate
 *   saldo   = opening.balance + delta
 *
 * El consolidado suma las cuentas que tienen saldo inicial a esa fecha. Si
 * ninguna lo tiene devuelve null (no hay ledger para esa fecha).
 *
 * Solo se reciben snapshots OPENING: las lecturas del banco (MANUAL / IMPORT /
 * CALCULATED) no participan del saldo, únicamente de la cuadratura.
 */

export interface BalanceSnapshot {
  asOfDate: Date;
  balance: number;
}

export interface BalanceTx {
  transactionDate: Date;
  amount: number;
}

export function includeBankTxInLedger(args: {
  transactionDate: Date;
  openingAsOfDate: Date;
  asOfDate: Date;
}): boolean {
  const tx = args.transactionDate.getTime();
  return tx > args.openingAsOfDate.getTime() && tx <= args.asOfDate.getTime();
}

export function getRealBankBalanceAt(
  atDate: Date,
  accountIds: string[],
  openingsByAccount: Map<string, BalanceSnapshot[]>,
  txsByAccount: Map<string, BalanceTx[]>,
): number | null {
  let total = 0;
  let anyAccountHasOpening = false;

  for (const accountId of accountIds) {
    const openings = openingsByAccount.get(accountId) ?? [];
    let opening: BalanceSnapshot | null = null;
    for (let i = openings.length - 1; i >= 0; i--) {
      if (openings[i].asOfDate.getTime() <= atDate.getTime()) {
        opening = openings[i];
        break;
      }
    }
    if (!opening) continue;
    anyAccountHasOpening = true;

    const txs = txsByAccount.get(accountId) ?? [];
    let delta = 0;
    for (const t of txs) {
      if (
        includeBankTxInLedger({
          transactionDate: t.transactionDate,
          openingAsOfDate: opening.asOfDate,
          asOfDate: atDate,
        })
      ) {
        delta += t.amount;
      }
    }
    total += opening.balance + delta;
  }

  return anyAccountHasOpening ? total : null;
}
