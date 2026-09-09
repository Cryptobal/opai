import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import {
  applyReportedBalance,
  syncCurrentBalanceFromMovements,
  type BalanceDiscrepancy,
} from "@/modules/finance/banking/bank-balance.service";
import {
  bankTxContentKey,
  dateKey,
  partitionInboundMovements,
  pickLatestBalanceHint,
  type InboundMovementLike,
} from "@/modules/finance/banking/bank-tx-content-key";

export interface Web4leadsAccountBalance {
  current: number;
  asOf: string;
}

export interface Web4leadsImportResult {
  imported: number;
  duplicates: number;
  insertedIds: string[];
  syncedBalance: number | null;
  discrepancy: BalanceDiscrepancy | null;
}

export async function loadVisibleContentCounts(args: {
  tenantId: string;
  bankAccountId: string;
  dates: Date[];
}): Promise<Map<string, number>> {
  if (args.dates.length === 0) return new Map();
  const rows = await prisma.financeBankTransaction.findMany({
    where: {
      tenantId: args.tenantId,
      bankAccountId: args.bankAccountId,
      hiddenAt: null,
      transactionDate: { in: args.dates },
    },
    select: {
      transactionDate: true,
      amount: true,
      description: true,
      reference: true,
    },
  });
  const counts = new Map<string, number>();
  for (const r of rows) {
    const key = bankTxContentKey({
      transactionDate: r.transactionDate,
      amount: r.amount,
      description: r.description,
      reference: r.reference,
    });
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export async function loadVisibleContentKeys(args: {
  tenantId: string;
  bankAccountId: string;
  dates: Date[];
}): Promise<Set<string>> {
  const counts = await loadVisibleContentCounts(args);
  return new Set(counts.keys());
}

/**
 * Inserta movimientos Web4Leads con doble idempotencia:
 *   1. `apiTransactionId = web4leads:<externalId>`
 *   2. conteo de huella fecha|monto|glosa|referencia (ids inestables /
 *      reenvíos; no descarta un externalId nuevo si el lote trae más
 *      ocurrencias que las ya visibles).
 *
 * `accountBalance` (top-level) tiene prioridad sobre `balance` por movimiento.
 * Tras insertar se evalúa la cuadratura y se ancla el saldo reportado.
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

  const [existingByExt, existingContentCounts] = await Promise.all([
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
    loadVisibleContentCounts({ tenantId, bankAccountId, dates }),
  ]);

  const existingExternalIds = new Set(
    existingByExt
      .map((r) => r.apiTransactionId)
      .filter((id): id is string => !!id)
      .map((id) => id.slice("web4leads:".length)),
  );

  const { toInsert, duplicateCount } = partitionInboundMovements({
    incoming: movements,
    existingExternalIds,
    existingContentCounts,
  });

  const startedAt = new Date();
  if (toInsert.length > 0) {
    await prisma.financeBankTransaction.createMany({
      data: toInsert.map((m) => ({
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
              in: toInsert.map((m) => `web4leads:${m.externalId}`),
            },
            createdAt: { gte: startedAt },
          },
          select: { id: true },
        });

  const hint = pickLatestBalanceHint(movements);
  const reported = accountBalance
    ? {
        asOf: accountBalance.asOf,
        balance: accountBalance.current,
        note: "Saldo informado por Fintoc (accountBalance)",
      }
    : hint
      ? {
          asOf: hint.asOfDate,
          balance: hint.balance,
          note: "Saldo informado por Web4Leads (balance del movimiento)",
        }
      : null;

  let discrepancy: BalanceDiscrepancy | null = null;
  let syncedBalance: number | null = null;

  if (reported) {
    const applied = await applyReportedBalance({
      tenantId,
      userId: null,
      bankAccountId,
      asOf: reported.asOf,
      balance: reported.balance,
      source: "CALCULATED",
      note: reported.note,
    });
    discrepancy = applied.discrepancy;
    if (applied.ok) {
      syncedBalance = applied.resolvedBalanceClp;
    }
  }

  if (syncedBalance == null && (inserted.length > 0 || reported)) {
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
    insertedIds: inserted.map((r) => r.id),
    syncedBalance,
    discrepancy,
  };
}
