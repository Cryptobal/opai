import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import {
  registerBankReading,
  syncCurrentBalanceFromMovements,
  type BalanceDiscrepancy,
} from "@/modules/finance/banking/bank-balance.service";
import {
  bankTxContentKey,
  dateKey,
  partitionInboundMovements,
  pickLatestBalanceHint,
  type ExistingContentRow,
  type InboundMovementLike,
} from "@/modules/finance/banking/bank-tx-content-key";

export interface Web4leadsAccountBalance {
  current: number;
  asOf: string;
}

export interface Web4leadsImportResult {
  imported: number;
  duplicates: number;
  /** Insertados marcados como posible duplicado (revisión en Cuadratura). */
  suspects: number;
  insertedIds: string[];
  /** Saldo del ledger tras el lote (no lo fija la lectura: lo fijan los movimientos). */
  syncedBalance: number | null;
  discrepancy: BalanceDiscrepancy | null;
}

/**
 * Filas ya guardadas (visibles u ocultas) agrupadas por huella para las
 * fechas del lote. Incluye ocultas: si el usuario ocultó una copia, una
 * reimportación no debe resucitarla.
 */
export async function loadContentRows(args: {
  tenantId: string;
  bankAccountId: string;
  dates: Date[];
}): Promise<Map<string, ExistingContentRow[]>> {
  if (args.dates.length === 0) return new Map();
  const rows = await prisma.financeBankTransaction.findMany({
    where: {
      tenantId: args.tenantId,
      bankAccountId: args.bankAccountId,
      transactionDate: { in: args.dates },
    },
    select: {
      id: true,
      transactionDate: true,
      amount: true,
      description: true,
      reference: true,
      balance: true,
    },
    orderBy: { createdAt: "asc" },
  });
  const byKey = new Map<string, ExistingContentRow[]>();
  for (const r of rows) {
    const key = bankTxContentKey({
      transactionDate: r.transactionDate,
      amount: r.amount,
      description: r.description,
      reference: r.reference,
    });
    const list = byKey.get(key) ?? [];
    list.push({ id: r.id, balance: r.balance != null ? Number(r.balance) : null });
    byKey.set(key, list);
  }
  return byKey;
}

export async function loadVisibleContentCounts(args: {
  tenantId: string;
  bankAccountId: string;
  dates: Date[];
}): Promise<Map<string, number>> {
  const rows = await loadContentRows(args);
  const counts = new Map<string, number>();
  for (const [key, list] of rows) counts.set(key, list.length);
  return counts;
}

/**
 * Inserta movimientos Web4Leads sin pérdidas:
 *   1. `apiTransactionId = web4leads:<externalId>` (idempotencia dura).
 *   2. Huella + `balance` como árbitro: misma huella y mismo saldo tras el
 *      movimiento = misma operación (se descarta); misma huella sin saldo
 *      que discrimine = se inserta marcada como posible duplicado.
 *
 * El saldo de la cuenta sale del ledger (movimientos). `accountBalance` o
 * el `balance` del último movimiento se registran como LECTURA del banco y
 * se cuadran contra el ledger; si difieren, se informa (`discrepancy`).
 */
export async function importWeb4leadsMovements(args: {
  tenantId: string;
  bankAccountId: string;
  movements: InboundMovementLike[];
  accountBalance?: Web4leadsAccountBalance | null;
}): Promise<Web4leadsImportResult> {
  const { tenantId, bankAccountId, movements } = args;
  const accountBalance = args.accountBalance ?? null;

  const empty: Web4leadsImportResult = {
    imported: 0,
    duplicates: 0,
    suspects: 0,
    insertedIds: [],
    syncedBalance: null,
    discrepancy: null,
  };

  if (movements.length === 0 && !accountBalance) {
    return empty;
  }

  const externalIds = movements.map((m) => `web4leads:${m.externalId}`);
  const dates = [
    ...new Set(movements.map((m) => dateKey(m.transactionDate))),
  ].map((d) => new Date(d));

  const [existingByExt, existingContentRows] = await Promise.all([
    externalIds.length === 0
      ? Promise.resolve([] as Array<{ apiTransactionId: string | null }>)
      : prisma.financeBankTransaction.findMany({
          where: {
            tenantId,
            bankAccountId,
            apiTransactionId: { in: externalIds },
          },
          select: { apiTransactionId: true },
        }),
    loadContentRows({ tenantId, bankAccountId, dates }),
  ]);

  const existingExternalIds = new Set(
    existingByExt
      .map((r) => r.apiTransactionId)
      .filter((id): id is string => !!id)
      .map((id) => id.slice("web4leads:".length)),
  );

  const { toInsert, duplicateCount, suspectCount } = partitionInboundMovements({
    incoming: movements,
    existingExternalIds,
    existingContentRows,
  });

  const startedAt = new Date();
  if (toInsert.length > 0) {
    await prisma.financeBankTransaction.createMany({
      data: toInsert.map(({ movement: m, dupSuspectOfId }) => ({
        tenantId,
        bankAccountId,
        transactionDate: new Date(m.transactionDate),
        description: m.description,
        reference: m.reference ?? null,
        amount: new Prisma.Decimal(m.amount),
        balance:
          m.balance != null && Number.isFinite(m.balance)
            ? new Prisma.Decimal(m.balance)
            : null,
        source: "API" as const,
        reconciliationStatus: "UNMATCHED" as const,
        apiTransactionId: `web4leads:${m.externalId}`,
        dupSuspectOfId,
      })),
      skipDuplicates: true,
    });
  }

  const inserted =
    toInsert.length === 0
      ? []
      : await prisma.financeBankTransaction.findMany({
          where: {
            tenantId,
            bankAccountId,
            apiTransactionId: {
              in: toInsert.map(({ movement: m }) => `web4leads:${m.externalId}`),
            },
            createdAt: { gte: startedAt },
          },
          select: {
            id: true,
            transactionDate: true,
            amount: true,
            description: true,
            reference: true,
            balance: true,
            dupSuspectOfId: true,
          },
        });

  // Copias dentro del mismo lote (misma huella, ids distintos, sin saldo que
  // discrimine): la primera queda limpia, las demás apuntan a ella.
  let intraBatchSuspects = 0;
  const byContent = new Map<string, typeof inserted>();
  for (const row of inserted) {
    const key = bankTxContentKey({
      transactionDate: row.transactionDate,
      amount: row.amount,
      description: row.description,
      reference: row.reference,
    });
    const list = byContent.get(key) ?? [];
    list.push(row);
    byContent.set(key, list);
  }
  for (const rows of byContent.values()) {
    if (rows.length < 2) continue;
    const allHaveBalance = rows.every((r) => r.balance != null);
    if (allHaveBalance) continue;
    const [first, ...rest] = rows;
    const targets = rest.filter((r) => r.dupSuspectOfId == null).map((r) => r.id);
    if (targets.length === 0) continue;
    await prisma.financeBankTransaction.updateMany({
      where: { tenantId, id: { in: targets } },
      data: { dupSuspectOfId: first!.id },
    });
    intraBatchSuspects += targets.length;
  }

  const hint = pickLatestBalanceHint(movements);
  const reading = accountBalance
    ? {
        asOf: accountBalance.asOf,
        balance: accountBalance.current,
        note: "Saldo informado por el proveedor (accountBalance)",
      }
    : hint
      ? {
          asOf: hint.asOfDate,
          balance: hint.balance,
          note: "Saldo informado por el proveedor (balance del último movimiento)",
        }
      : null;

  let discrepancy: BalanceDiscrepancy | null = null;
  let syncedBalance: number | null = null;

  if (reading) {
    const applied = await registerBankReading({
      tenantId,
      userId: null,
      bankAccountId,
      asOf: reading.asOf,
      balance: reading.balance,
      source: "CALCULATED",
      note: reading.note,
    });
    discrepancy = applied.discrepancy;
    if (applied.ok) {
      syncedBalance = applied.resolvedBalanceClp;
    }
  }

  if (syncedBalance == null && (inserted.length > 0 || reading)) {
    const resolved = await syncCurrentBalanceFromMovements(
      tenantId,
      bankAccountId,
    );
    syncedBalance = resolved.resolvedBalanceClp;
  }

  await prisma.financeBankAccount.update({
    where: { id: bankAccountId },
    data: {
      apiLastSync: new Date(),
      apiProvider: "WEB4LEADS",
    },
  });

  return {
    imported: inserted.length,
    duplicates: duplicateCount + (toInsert.length - inserted.length),
    suspects: suspectCount + intraBatchSuspects,
    insertedIds: inserted.map((r) => r.id),
    syncedBalance,
    discrepancy,
  };
}
