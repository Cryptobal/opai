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
 *
 * Precedencia de ancla: en la misma fecha, MANUAL gana sobre IMPORT/CALCULATED
 * para que una cartola del mismo día no pise un saldo fijado a mano.
 */

import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";
import type { FinanceBalanceSource } from "@prisma/client";
import { bankTxDateFilterAfterAnchor } from "@/modules/finance/banking/bank-tx-after-anchor";

export interface ResolvedAccountBalance {
  anchorSnapshotDate: Date | null;
  anchorBalanceClp: number;
  txDeltaClp: number;
  txCount: number;
  resolvedBalanceClp: number;
  /** Origen del snapshot ancla (si hay). */
  anchorSource?: FinanceBalanceSource | null;
}

export interface BalanceAnchorCandidate {
  balance: unknown;
  asOfDate: Date;
  source: FinanceBalanceSource;
  createdAt: Date;
}

/**
 * Elige el ancla entre candidatos ya filtrados (asOfDate ≤ hoy), ordenados
 * por asOfDate desc / createdAt desc. En empate de fecha, MANUAL gana.
 */
export function pickBalanceAnchor(
  candidates: BalanceAnchorCandidate[],
): BalanceAnchorCandidate | null {
  if (candidates.length === 0) return null;
  const maxTime = candidates[0]!.asOfDate.getTime();
  const sameDate = candidates.filter((c) => c.asOfDate.getTime() === maxTime);
  const manual = sameDate.find((c) => c.source === "MANUAL");
  return manual ?? sameDate[0] ?? null;
}

/**
 * True si conviene crear un snapshot IMPORT de cierre de cartola.
 * False cuando ya hay un MANUAL con fecha ≥ cierre (protege el saldo fijado).
 */
export function shouldApplyImportClosingBalance(args: {
  importAsOfDate: Date;
  protectingManualAsOfDate: Date | null;
}): boolean {
  if (!args.protectingManualAsOfDate) return true;
  return args.protectingManualAsOfDate.getTime() < args.importAsOfDate.getTime();
}

function toLocalDateOnly(date: Date): Date {
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/**
 * Resuelve el saldo de una cuenta a una fecha: snapshot más reciente ≤ fecha
 * + Σ movimientos visibles de cartola (hiddenAt IS NULL).
 *
 * IMPORT: transactionDate > asOfDate (el closing ya trae el día del extracto).
 * MANUAL/CALCULATED: transactionDate ≥ asOfDate — un ancla del mismo día no
 * puede ocultar un abono ya visible en cartola. MATCHED / DTE borrador no
 * filtran: la plata del banco no depende de a qué documento se concilió.
 *
 * Sin snapshot, devuelve `currentBalance` (no se puede derivar solo desde
 * movimientos).
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

  const candidates = await prisma.financeBankAccountBalance.findMany({
    where: {
      tenantId,
      bankAccountId,
      asOfDate: { lte: todayDate },
    },
    orderBy: [{ asOfDate: "desc" }, { createdAt: "desc" }],
    take: 20,
    select: { balance: true, asOfDate: true, source: true, createdAt: true },
  });

  const anchor = pickBalanceAnchor(candidates);

  if (!anchor) {
    const fallback = Number(account.currentBalance ?? 0);
    return {
      anchorSnapshotDate: null,
      anchorBalanceClp: fallback,
      txDeltaClp: 0,
      txCount: 0,
      resolvedBalanceClp: fallback,
      anchorSource: null,
    };
  }

  const txAgg = await prisma.financeBankTransaction.aggregate({
    where: {
      tenantId,
      bankAccountId,
      hiddenAt: null,
      transactionDate: bankTxDateFilterAfterAnchor(
        anchor.asOfDate,
        todayDate,
        anchor.source,
      ),
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
    anchorSource: anchor.source,
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
 * resulta ser la ancla efectiva (tras precedencia MANUAL), actualiza
 * `currentBalance`. Devuelve el snapshot creado.
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

  // Alinear currentBalance con la ancla efectiva (MANUAL gana en empate).
  await syncCurrentBalanceFromMovements(tenantId, input.bankAccountId);

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
