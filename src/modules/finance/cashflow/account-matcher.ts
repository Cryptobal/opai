import "server-only";
import { differenceInDays } from "date-fns";
import type { VirtualOccurrence } from "./types";

export interface BankLinkSlim {
  bankTransactionId: string;
  transactionDate: Date;
  /** Monto en CLP siempre positivo (signed-correct: el caller ya consideró kind). */
  amountClp: number;
  /** categoryId resuelto desde el accountPlanId del link / DTE / convención de payroll. */
  categoryId: string;
}

/**
 * Matcher account-driven. Para cada link bancario ya conciliado contra una
 * cuenta contable, busca la ocurrencia proyectada con la misma categoría
 * dentro de la ventana de tolerancia de días, y la marca PAID con varianza.
 *
 * Función pura: NO escribe a la DB. Devuelve un nuevo arreglo solo con las
 * ocurrencias actualizadas (las que matchearon). Las que no matchearon NO
 * aparecen en el output. El caller mergea estos updates con el listado
 * original.
 *
 * Reglas de match:
 *  - misma `categoryId`
 *  - |scheduledDate − transactionDate| ≤ matchDaysTolerance (días)
 *  - occurrence debe tener status=PROJECTED y bankTransactionId=null
 *  - occurrence debe tener itemId (las virtuales auto-generadas se ignoran)
 *  - cada link se usa a lo más una vez (best-fit por menor diff de días)
 *  - links se procesan en orden ascendente de fecha para determinismo
 */
export async function matchOccurrencesToBankLinks(
  occurrences: VirtualOccurrence[],
  links: BankLinkSlim[],
  config: { matchDaysTolerance: number },
): Promise<VirtualOccurrence[]> {
  const usedLinkIds = new Set<string>();
  const usedOccKeys = new Set<string>();
  const updated: VirtualOccurrence[] = [];

  // Sort links por fecha ascendente para determinismo
  const sortedLinks = [...links].sort(
    (a, b) => a.transactionDate.getTime() - b.transactionDate.getTime(),
  );

  for (const link of sortedLinks) {
    if (usedLinkIds.has(link.bankTransactionId)) continue;

    let best: { occ: VirtualOccurrence; daysDiff: number; key: string } | null = null;

    for (const occ of occurrences) {
      if (occ.bankTransactionId) continue;
      if (occ.status !== "PROJECTED") continue;
      if (occ.itemId === null) continue;
      if (occ.categoryId !== link.categoryId) continue;

      const occKey = `${occ.itemId}|${occ.scheduledDate.toISOString().slice(0, 10)}`;
      if (usedOccKeys.has(occKey)) continue;

      const daysDiff = Math.abs(differenceInDays(link.transactionDate, occ.scheduledDate));
      if (daysDiff > config.matchDaysTolerance) continue;

      if (!best || daysDiff < best.daysDiff) {
        best = { occ, daysDiff, key: occKey };
      }
    }

    if (best) {
      const variance = link.amountClp - best.occ.amountClp;
      updated.push({
        ...best.occ,
        status: "PAID",
        bankTransactionId: link.bankTransactionId,
        actualAmountClp: link.amountClp,
        varianceClp: variance,
        effectiveDate: link.transactionDate,
      });
      usedLinkIds.add(link.bankTransactionId);
      usedOccKeys.add(best.key);
    }
  }

  return updated;
}
