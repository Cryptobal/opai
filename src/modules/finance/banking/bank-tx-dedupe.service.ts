import { prisma } from "@/lib/prisma";
import {
  bankTxContentKey,
  pickContentDuplicateKeeper,
} from "@/modules/finance/banking/bank-tx-content-key";

export interface ContentDuplicateGroup {
  key: string;
  transactionDate: string;
  amount: number;
  description: string;
  reference: string | null;
  /** Fila que se conservaría si el grupo fuera una copia (MATCHED > más antigua). */
  keeperId: string;
  /** Todas las filas traen el mismo saldo del banco: copia casi segura. */
  sameBalance: boolean;
  rows: Array<{
    id: string;
    apiTransactionId: string | null;
    balance: number | null;
    reconciliationStatus: string;
    createdAt: string;
  }>;
}

/**
 * Propone grupos de filas visibles con la misma huella (fecha|monto|glosa|
 * referencia). NO oculta nada: dos transferencias iguales el mismo día son
 * dos movimientos reales. El usuario decide en Cuadratura; el `balance` del
 * banco (saldo tras el movimiento) es la única evidencia fuerte de copia.
 */
export async function findContentDuplicateGroups(args: {
  tenantId: string;
  bankAccountId: string;
  from?: Date;
  to?: Date;
}): Promise<ContentDuplicateGroup[]> {
  const rows = await prisma.financeBankTransaction.findMany({
    where: {
      tenantId: args.tenantId,
      bankAccountId: args.bankAccountId,
      hiddenAt: null,
      ...(args.from || args.to
        ? {
            transactionDate: {
              ...(args.from ? { gte: args.from } : {}),
              ...(args.to ? { lte: args.to } : {}),
            },
          }
        : {}),
    },
    select: {
      id: true,
      transactionDate: true,
      amount: true,
      description: true,
      reference: true,
      balance: true,
      apiTransactionId: true,
      createdAt: true,
      reconciliationStatus: true,
    },
    orderBy: [{ transactionDate: "desc" }, { createdAt: "asc" }],
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

  const out: ContentDuplicateGroup[] = [];
  for (const [key, group] of groups) {
    if (group.length < 2) continue;
    const first = group[0]!;
    const balances = group.map((r) => (r.balance != null ? Number(r.balance) : null));
    out.push({
      key,
      transactionDate: first.transactionDate.toISOString().slice(0, 10),
      amount: Number(first.amount),
      description: first.description,
      reference: first.reference,
      keeperId: pickContentDuplicateKeeper(group),
      sameBalance:
        balances.every((b) => b != null) && balances.every((b) => b === balances[0]),
      rows: group.map((r) => ({
        id: r.id,
        apiTransactionId: r.apiTransactionId,
        balance: r.balance != null ? Number(r.balance) : null,
        reconciliationStatus: r.reconciliationStatus,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  }
  return out;
}
