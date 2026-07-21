import "server-only";
import { prisma } from "@/lib/prisma";
import { resolveAccountBalanceFromMovements } from "@/modules/finance/banking/bank-balance.service";

export interface OpeningBalanceBreakdown {
  /** Saldo total resultante en CLP, "as of today" (snapshot + Σ tx posteriores).
   *  Útil para drift/anclas. Puede desviarse del saldo real si entran
   *  movimientos sin refrescar el snapshot (ej. API que solo actualiza
   *  currentBalance). Para "el monto que hay HOY en el banco" usar
   *  `currentTotalClp`. */
  totalClp: number;
  /** Suma de `currentBalance` de las cuentas activas — alineado con Bancos.
   *  Cuando hay snapshot, usa snapshot + movimientos (misma fórmula que
   *  `syncCurrentBalanceFromMovements`). Fallback a `currentBalance` solo
   *  sin ancla. */
  currentTotalClp: number;
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
  let currentTotalClp = 0;

  for (const acc of accounts) {
    const resolved = await resolveAccountBalanceFromMovements(
      tenantId,
      acc.id,
      today,
    );
    perAccount.push({
      bankAccountId: acc.id,
      bankName: acc.bankName,
      accountNumber: acc.accountNumber,
      anchorSnapshotDate: resolved.anchorSnapshotDate,
      anchorBalanceClp: resolved.anchorBalanceClp,
      txDeltaClp: resolved.txDeltaClp,
      txCount: resolved.txCount,
      resolvedBalanceClp: resolved.resolvedBalanceClp,
    });
    currentTotalClp += resolved.resolvedBalanceClp;
  }

  const totalClp = perAccount.reduce((s, a) => s + a.resolvedBalanceClp, 0);

  return { totalClp, currentTotalClp, perAccount };
}
