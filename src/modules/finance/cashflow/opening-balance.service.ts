import "server-only";
import { prisma } from "@/lib/prisma";
import {
  resolveAccountBalanceFromMovements,
  findLatestUnexplainedDiscrepancy,
} from "@/modules/finance/banking/bank-balance.service";
import type { FinanceBalanceSource } from "@prisma/client";

export interface OpeningBalanceBreakdown {
  /** Saldo total del ledger en CLP "as of today" (saldo inicial + Σ tx visibles). */
  totalClp: number;
  /** Igual a `totalClp` — se mantiene por compatibilidad con consumidores. */
  currentTotalClp: number;
  /** Una fila por cuenta CLP activa para auditoría. */
  perAccount: Array<{
    bankAccountId: string;
    bankName: string;
    accountNumber: string;
    /** Fecha de corte del saldo inicial (OPENING); null si la cuenta no lo tiene. */
    anchorSnapshotDate: Date | null;
    anchorBalanceClp: number;
    anchorSource: FinanceBalanceSource | null;
    /** Σ movimientos visibles posteriores al saldo inicial y ≤ corte. */
    txDeltaClp: number;
    /** Cuántas bank tx se sumaron. */
    txCount: number;
    /** Resultado final por cuenta: anchorBalanceClp + txDeltaClp. */
    resolvedBalanceClp: number;
    /** True si falta el saldo inicial: resolvedBalanceClp es solo el cache. */
    needsOpening: boolean;
    lastDiscrepancy: {
      asOfDate: string;
      deltaClp: number;
    } | null;
  }>;
}

/**
 * Resuelve "Banco hoy" para el tenant con la regla del libro mayor.
 *
 * Por cada cuenta CLP activa:
 *  1. Toma el saldo inicial (OPENING) de la cuenta.
 *  2. Suma bank_tx visibles (hidden_at IS NULL, sin filtrar MATCHED/DTE) con
 *     transactionDate > OPENING.asOfDate AND ≤ corte.
 *  3. Sin saldo inicial usa `currentBalance` como fallback y NO suma tx
 *     (`needsOpening: true` para que la UI pida definirlo).
 *
 * Las lecturas del banco (MANUAL/IMPORT/CALCULATED) no participan del saldo;
 * `lastDiscrepancy` expone la última diferencia lectura vs ledger.
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
    const lastDiscrepancy = await findLatestUnexplainedDiscrepancy(
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
      anchorSource: resolved.anchorSource ?? null,
      txDeltaClp: resolved.txDeltaClp,
      txCount: resolved.txCount,
      resolvedBalanceClp: resolved.resolvedBalanceClp,
      needsOpening: resolved.needsOpening,
      lastDiscrepancy: lastDiscrepancy
        ? { asOfDate: lastDiscrepancy.asOfDate, deltaClp: lastDiscrepancy.deltaClp }
        : null,
    });
    currentTotalClp += resolved.resolvedBalanceClp;
  }

  const totalClp = perAccount.reduce((s, a) => s + a.resolvedBalanceClp, 0);

  return { totalClp, currentTotalClp, perAccount };
}
