/**
 * Bank Account Balance History Service
 *
 * Maneja los snapshots históricos de saldo de una cuenta bancaria. Permite:
 *   - Fijar manualmente el saldo a una fecha (auditado por usuario y nota).
 *   - Listar el historial completo de saldos de una cuenta.
 *   - Resolver el saldo "más cercano hacia atrás" para una fecha dada.
 *
 * Cuando se fija un saldo manual, además se actualiza `currentBalance` y
 * `balanceUpdatedAt` en `FinanceBankAccount` SI la fecha del snapshot es
 * la más reciente registrada — esto mantiene la pestaña "Cuentas" coherente
 * con el último saldo conocido.
 */

import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";
import type { FinanceBalanceSource } from "@prisma/client";

export interface ResolvedAccountBalance {
  anchorSnapshotDate: Date | null;
  anchorBalanceClp: number;
  txDeltaClp: number;
  txCount: number;
  resolvedBalanceClp: number;
}

function toLocalDateOnly(date: Date): Date {
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/**
 * Resuelve el saldo de una cuenta a una fecha: snapshot más reciente ≤ fecha
 * + Σ movimientos visibles posteriores al snapshot. Sin snapshot, devuelve
 * `currentBalance` (no se puede derivar solo desde movimientos).
 */
export async function resolveAccountBalanceFromMovements(
  tenantId: string,
  bankAccountId: string,
  asOfDate?: Date,
): Promise<ResolvedAccountBalance> {
  const account = await prisma.financeBankAccount.findFirst({
    where: { id: bankAccountId, tenantId },
    select: { currentBalance: true },
  });
  if (!account) {
    throw new Error("Cuenta bancaria no encontrada");
  }

  const todayDate = toLocalDateOnly(asOfDate ?? new Date());

  const anchor = await prisma.financeBankAccountBalance.findFirst({
    where: {
      tenantId,
      bankAccountId,
      asOfDate: { lte: todayDate },
    },
    orderBy: [{ asOfDate: "desc" }, { createdAt: "desc" }],
    select: { balance: true, asOfDate: true },
  });

  if (!anchor) {
    const fallback = Number(account.currentBalance ?? 0);
    return {
      anchorSnapshotDate: null,
      anchorBalanceClp: fallback,
      txDeltaClp: 0,
      txCount: 0,
      resolvedBalanceClp: fallback,
    };
  }

  const txAgg = await prisma.financeBankTransaction.aggregate({
    where: {
      tenantId,
      bankAccountId,
      hiddenAt: null,
      transactionDate: { gt: anchor.asOfDate, lte: todayDate },
    },
    _sum: { amount: true },
    _count: { _all: true },
  });

  const anchorBalanceClp = Number(anchor.balance);
  const txDeltaClp = Number(txAgg._sum.amount ?? 0);

  return {
    anchorSnapshotDate: anchor.asOfDate,
    anchorBalanceClp,
    txDeltaClp,
    txCount: txAgg._count._all,
    resolvedBalanceClp: anchorBalanceClp + txDeltaClp,
  };
}

/**
 * Recalcula y persiste `currentBalance` desde snapshot + movimientos.
 * Idempotente: conviene llamarlo tras cada import o cambio de movimientos.
 */
export async function syncCurrentBalanceFromMovements(
  tenantId: string,
  bankAccountId: string,
  asOfDate?: Date,
): Promise<ResolvedAccountBalance> {
  const resolved = await resolveAccountBalanceFromMovements(
    tenantId,
    bankAccountId,
    asOfDate,
  );

  if (resolved.anchorSnapshotDate != null) {
    await prisma.financeBankAccount.update({
      where: { id: bankAccountId },
      data: {
        currentBalance: new Decimal(resolved.resolvedBalanceClp),
        balanceUpdatedAt: new Date(),
      },
    });
  }

  return resolved;
}

export interface SetBalanceSnapshotInput {
  bankAccountId: string;
  asOfDate: string; // YYYY-MM-DD
  balance: number;
  source?: FinanceBalanceSource;
  note?: string | null;
}

/**
 * Crea un snapshot de saldo para una cuenta a una fecha. Si esta fecha
 * resulta ser la más reciente registrada, actualiza el `currentBalance`
 * de la cuenta. Devuelve el snapshot creado.
 */
export async function setBalanceSnapshot(
  tenantId: string,
  userId: string | null,
  input: SetBalanceSnapshotInput
) {
  const account = await prisma.financeBankAccount.findFirst({
    where: { id: input.bankAccountId, tenantId },
    select: { id: true },
  });
  if (!account) {
    throw new Error("Cuenta bancaria no encontrada");
  }

  const created = await prisma.financeBankAccountBalance.create({
    data: {
      tenantId,
      bankAccountId: input.bankAccountId,
      asOfDate: new Date(input.asOfDate),
      balance: new Decimal(input.balance),
      source: input.source ?? "MANUAL",
      note: input.note ?? null,
      createdById: userId ?? null,
    },
  });

  // Si este snapshot es el más reciente, alinear currentBalance con snapshot + tx.
  const latest = await prisma.financeBankAccountBalance.findFirst({
    where: { tenantId, bankAccountId: input.bankAccountId },
    orderBy: [{ asOfDate: "desc" }, { createdAt: "desc" }],
    select: { id: true },
  });
  if (latest?.id === created.id) {
    await syncCurrentBalanceFromMovements(tenantId, input.bankAccountId);
  }

  return created;
}

/**
 * Lista el historial completo de snapshots de saldo de una cuenta,
 * más recientes primero.
 */
export async function listBalanceHistory(
  tenantId: string,
  bankAccountId: string
) {
  return prisma.financeBankAccountBalance.findMany({
    where: { tenantId, bankAccountId },
    orderBy: [{ asOfDate: "desc" }, { createdAt: "desc" }],
  });
}

/**
 * Elimina un snapshot. Si el eliminado era el más reciente, recalcula
 * `currentBalance` desde el siguiente más reciente (o lo deja en null
 * si era el único).
 */
export async function deleteBalanceSnapshot(
  tenantId: string,
  bankAccountId: string,
  snapshotId: string
) {
  const snap = await prisma.financeBankAccountBalance.findFirst({
    where: { id: snapshotId, tenantId, bankAccountId },
  });
  if (!snap) {
    throw new Error("Snapshot no encontrado");
  }

  await prisma.financeBankAccountBalance.delete({ where: { id: snapshotId } });

  await syncCurrentBalanceFromMovements(tenantId, bankAccountId);
}
