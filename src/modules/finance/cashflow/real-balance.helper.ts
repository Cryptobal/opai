/**
 * Calcula el saldo banco real consolidado a una fecha dada, de forma
 * independiente por bucket (no acumulativa). Para cada cuenta:
 *
 *   snapshot = el más reciente con asOfDate <= atDate
 *   delta    = sum(tx con transactionDate > snapshot.asOfDate AND <= atDate)
 *   saldo    = snapshot.balance + delta
 *
 * El consolidado suma los saldos de todas las cuentas que tienen snapshot.
 * Si ninguna cuenta tiene snapshot, devuelve null (no hay anchor confiable).
 *
 * Sustituye al algoritmo previo que arrancaba en `opening` y sumaba los
 * movimientos de cada bucket pasado al runningReal — eso duplicaba la plata
 * porque `opening` ya es el saldo "as of today" (snapshot más reciente + tx
 * posteriores hasta hoy).
 */
export interface BalanceSnapshot {
  asOfDate: Date;
  balance: number;
}

export interface BalanceTx {
  transactionDate: Date;
  amount: number;
}

export function getRealBankBalanceAt(
  atDate: Date,
  accountIds: string[],
  snapshotsByAccount: Map<string, BalanceSnapshot[]>,
  txsByAccount: Map<string, BalanceTx[]>,
): number | null {
  let total = 0;
  let anyAccountHasSnapshot = false;

  for (const accountId of accountIds) {
    const snaps = snapshotsByAccount.get(accountId) ?? [];
    let anchor: BalanceSnapshot | null = null;
    for (let i = snaps.length - 1; i >= 0; i--) {
      if (snaps[i].asOfDate.getTime() <= atDate.getTime()) {
        anchor = snaps[i];
        break;
      }
    }
    if (!anchor) continue;
    anyAccountHasSnapshot = true;

    const txs = txsByAccount.get(accountId) ?? [];
    let delta = 0;
    for (const t of txs) {
      if (
        t.transactionDate.getTime() > anchor.asOfDate.getTime() &&
        t.transactionDate.getTime() <= atDate.getTime()
      ) {
        delta += t.amount;
      }
    }
    total += anchor.balance + delta;
  }

  return anyAccountHasSnapshot ? total : null;
}
