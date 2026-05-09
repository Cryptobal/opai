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

  // Si este snapshot es el más reciente, actualizar el saldo "actual".
  const latest = await prisma.financeBankAccountBalance.findFirst({
    where: { tenantId, bankAccountId: input.bankAccountId },
    orderBy: [{ asOfDate: "desc" }, { createdAt: "desc" }],
    select: { id: true, balance: true, asOfDate: true },
  });
  if (latest?.id === created.id) {
    await prisma.financeBankAccount.update({
      where: { id: input.bankAccountId },
      data: {
        currentBalance: created.balance,
        balanceUpdatedAt: created.asOfDate,
      },
    });
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

  // Recalcular currentBalance con el snapshot más reciente que quede.
  const latest = await prisma.financeBankAccountBalance.findFirst({
    where: { tenantId, bankAccountId },
    orderBy: [{ asOfDate: "desc" }, { createdAt: "desc" }],
  });
  await prisma.financeBankAccount.update({
    where: { id: bankAccountId },
    data: {
      currentBalance: latest?.balance ?? null,
      balanceUpdatedAt: latest?.asOfDate ?? null,
    },
  });
}
