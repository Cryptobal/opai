import { prisma } from "@/lib/prisma";
import { bulkHideTransactions } from "@/modules/finance/banking/bank-transaction.service";
import {
  bankTxContentKey,
  pickContentDuplicateKeeper,
} from "@/modules/finance/banking/bank-tx-content-key";

const HIDE_REASON =
  "Duplicado de contenido (mismo fecha/monto/glosa/referencia). Conservamos una sola fila visible.";

export interface HideContentDuplicatesResult {
  groups: number;
  hidden: number;
  keeperIds: string[];
}

/**
 * Oculta copias visibles de la misma huella de contenido. Conserva MATCHED
 * si hay, si no la más antigua. Borra vínculos de las copias para que
 * factoring/DTE no queden contabilizados N veces.
 */
export async function hideContentDuplicateBankTransactions(args: {
  tenantId: string;
  bankAccountId: string;
  hiddenById?: string | null;
}): Promise<HideContentDuplicatesResult> {
  const rows = await prisma.financeBankTransaction.findMany({
    where: {
      tenantId: args.tenantId,
      bankAccountId: args.bankAccountId,
      hiddenAt: null,
    },
    select: {
      id: true,
      transactionDate: true,
      amount: true,
      description: true,
      reference: true,
      createdAt: true,
      reconciliationStatus: true,
    },
  });

  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = bankTxContentKey({
      transactionDate: row.transactionDate,
      amount: row.amount,
      description: row.description,
      reference: row.reference,
    });
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }

  const keeperIds: string[] = [];
  const hideIds: string[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const keeperId = pickContentDuplicateKeeper(group);
    keeperIds.push(keeperId);
    for (const row of group) {
      if (row.id !== keeperId) hideIds.push(row.id);
    }
  }

  if (hideIds.length === 0) {
    return { groups: 0, hidden: 0, keeperIds: [] };
  }

  await prisma.financeBankTransactionLink.deleteMany({
    where: { tenantId: args.tenantId, bankTransactionId: { in: hideIds } },
  });
  await prisma.financePaymentRecord.updateMany({
    where: { tenantId: args.tenantId, bankTransactionId: { in: hideIds } },
    data: { bankTransactionId: null },
  });
  await prisma.financeReconciliationMatch.deleteMany({
    where: { bankTransactionId: { in: hideIds } },
  });

  const hidden = await bulkHideTransactions(
    args.tenantId,
    hideIds,
    args.hiddenById ?? null,
    HIDE_REASON,
  );

  return {
    groups: keeperIds.length,
    hidden,
    keeperIds,
  };
}
