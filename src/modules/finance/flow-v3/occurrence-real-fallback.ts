/**
 * Fallback REAL: occurrence de cashflow (asignación v2) sin BankTxLink.
 * Puro, sin prisma — lo usan loadReal y tests.
 *
 * Ítems RETIRO_SOCIO se nombran "Retiro socios YYYY-MM"; matcheamos por
 * categoryId o por prefijo del nombre de fila.
 */
import { normalizeRowName } from "./row-match";
import type { FlowRowRef, RealTxInput } from "./types";

export interface OccurrenceFallbackInput {
  bankTransactionId: string;
  categoryId: string | null;
  itemName: string;
}

export function resolveRowIdForOccurrence(
  occ: OccurrenceFallbackInput,
  rows: Array<Pick<FlowRowRef, "id" | "name" | "categoryId">>,
): string | null {
  if (occ.categoryId) {
    const byCat = rows.find((r) => r.categoryId === occ.categoryId);
    if (byCat) return byCat.id;
  }
  const name = normalizeRowName(occ.itemName);
  if (!name) return null;
  for (const r of rows) {
    const rn = normalizeRowName(r.name);
    if (!rn) continue;
    if (name === rn || name.startsWith(`${rn} `)) return r.id;
  }
  return null;
}

/**
 * Mutates txs in place: cargos/abonos MATCHED vía occurrence y sin links
 * reciben un link sintético EXPENSE/INCOME con flowRowId.
 */
export function mergeOccurrenceLinksIntoTxs(
  txs: RealTxInput[],
  occs: OccurrenceFallbackInput[],
  rows: Array<Pick<FlowRowRef, "id" | "name" | "categoryId">>,
): void {
  if (occs.length === 0) return;
  const occByTx = new Map<string, OccurrenceFallbackInput>();
  for (const occ of occs) {
    if (!occByTx.has(occ.bankTransactionId)) occByTx.set(occ.bankTransactionId, occ);
  }
  for (const tx of txs) {
    if (tx.links.length > 0) continue;
    const occ = occByTx.get(tx.id);
    if (!occ) continue;
    const rowId = resolveRowIdForOccurrence(occ, rows);
    if (!rowId) continue;
    tx.links.push({
      targetType: tx.amountClp >= 0 ? "INCOME" : "EXPENSE",
      targetId: null,
      amountClp: Math.abs(tx.amountClp),
      accountPlanId: null,
      flowRowId: rowId,
    });
  }
}
