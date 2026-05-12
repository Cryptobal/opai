import "server-only";
import { prisma } from "@/lib/prisma";

export interface OpeningBalanceBreakdown {
  /** Saldo total resultante en CLP, "as of today". */
  totalClp: number;
  /** Una fila por cuenta CLP activa para auditoría. */
  perAccount: Array<{
    bankAccountId: string;
    bankName: string;
    accountNumber: string;
    /** El snapshot más reciente usado como anclaje (o null si solo se usa currentBalance). */
    anchorSnapshotDate: Date | null;
    anchorBalanceClp: number;
    /** Movimientos posteriores al anchor (suma signada). */
    txDeltaClp: number;
    /** Cuántas bank tx se sumaron. */
    txCount: number;
    /** Resultado final por cuenta: anchorBalanceClp + txDeltaClp. */
    resolvedBalanceClp: number;
  }>;
}

/**
 * Resuelve el saldo bancario "as of today" para el tenant.
 *
 * Por cada cuenta CLP activa:
 *  1. Toma el snapshot más reciente con asOfDate <= hoy (de cualquier source).
 *  2. Suma todas las bank_tx visibles (hidden_at IS NULL) con
 *     transactionDate > snapshot.asOfDate AND <= today.
 *  3. Si no hay snapshot, usa `currentBalance` como fallback y NO suma tx
 *     (porque sin anchor no sabemos desde qué fecha contar).
 *
 * El total es la suma de los resolvedBalanceClp por cuenta. Devuelve también
 * el desglose para que la UI pueda mostrar "última cartola hace N días" y
 * para el panel de cuadratura.
 */
export async function resolveOpeningBalance(
  tenantId: string,
  asOfDate?: Date,
): Promise<OpeningBalanceBreakdown> {
  const today = asOfDate ?? new Date();
  const todayDate = new Date(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );

  const accounts = await prisma.financeBankAccount.findMany({
    where: { tenantId, isActive: true, currency: "CLP" },
    select: {
      id: true,
      bankName: true,
      accountNumber: true,
      currentBalance: true,
    },
  });

  const perAccount: OpeningBalanceBreakdown["perAccount"] = [];

  for (const acc of accounts) {
    const anchor = await prisma.financeBankAccountBalance.findFirst({
      where: {
        tenantId,
        bankAccountId: acc.id,
        asOfDate: { lte: todayDate },
      },
      orderBy: [{ asOfDate: "desc" }, { createdAt: "desc" }],
      select: { balance: true, asOfDate: true },
    });

    if (!anchor) {
      perAccount.push({
        bankAccountId: acc.id,
        bankName: acc.bankName,
        accountNumber: acc.accountNumber,
        anchorSnapshotDate: null,
        anchorBalanceClp: Number(acc.currentBalance ?? 0),
        txDeltaClp: 0,
        txCount: 0,
        resolvedBalanceClp: Number(acc.currentBalance ?? 0),
      });
      continue;
    }

    const txAgg = await prisma.financeBankTransaction.aggregate({
      where: {
        tenantId,
        bankAccountId: acc.id,
        hiddenAt: null,
        transactionDate: { gt: anchor.asOfDate, lte: todayDate },
      },
      _sum: { amount: true },
      _count: { _all: true },
    });
    const txDelta = Number(txAgg._sum.amount ?? 0);
    const anchorBalance = Number(anchor.balance);
    perAccount.push({
      bankAccountId: acc.id,
      bankName: acc.bankName,
      accountNumber: acc.accountNumber,
      anchorSnapshotDate: anchor.asOfDate,
      anchorBalanceClp: anchorBalance,
      txDeltaClp: txDelta,
      txCount: txAgg._count._all,
      resolvedBalanceClp: anchorBalance + txDelta,
    });
  }

  const totalClp = perAccount.reduce((s, a) => s + a.resolvedBalanceClp, 0);

  return { totalClp, perAccount };
}
