import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import {
  shouldApplyImportClosingBalance,
  setBalanceSnapshot,
  syncCurrentBalanceFromMovements,
} from "@/modules/finance/banking/bank-balance.service";
import {
  bankTxContentKey,
  dateKey,
  partitionInboundMovements,
  pickLatestBalanceHint,
  type InboundMovementLike,
} from "@/modules/finance/banking/bank-tx-content-key";

export interface Web4leadsImportResult {
  imported: number;
  duplicates: number;
  insertedIds: string[];
  syncedBalance: number | null;
}

export async function loadVisibleContentKeys(args: {
  tenantId: string;
  bankAccountId: string;
  dates: Date[];
}): Promise<Set<string>> {
  if (args.dates.length === 0) return new Set();
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
  return new Set(
    rows.map((r) =>
      bankTxContentKey({
        transactionDate: r.transactionDate,
        amount: r.amount,
        description: r.description,
        reference: r.reference,
      }),
    ),
  );
}

/**
 * Inserta movimientos Web4Leads con doble idempotencia:
 *   1. `apiTransactionId = web4leads:<externalId>` (contrato original)
 *   2. huella contenido fecha|monto|glosa|referencia (cubre ids inestables)
 *
 * Si el lote trae `balance`, y no hay un MANUAL del mismo día o más nuevo,
 * se crea un snapshot CALCULATED — el contrato documentado con el proveedor.
 */
export async function importWeb4leadsMovements(args: {
  tenantId: string;
  bankAccountId: string;
  movements: InboundMovementLike[];
}): Promise<Web4leadsImportResult> {
  const { tenantId, bankAccountId, movements } = args;
  if (movements.length === 0) {
    return { imported: 0, duplicates: 0, insertedIds: [], syncedBalance: null };
  }

  const externalIds = movements.map((m) => `web4leads:${m.externalId}`);
  const dates = [
    ...new Set(movements.map((m) => dateKey(m.transactionDate))),
  ].map((d) => new Date(d));

  const [existingByExt, existingContent] = await Promise.all([
    prisma.financeBankTransaction.findMany({
      where: {
        tenantId,
        bankAccountId,
        apiTransactionId: { in: externalIds },
      },
      select: { apiTransactionId: true },
    }),
    loadVisibleContentKeys({ tenantId, bankAccountId, dates }),
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
    existingContentKeys: existingContent,
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
  let appliedHint = false;
  if (hint) {
    const protectingManual = await prisma.financeBankAccountBalance.findFirst({
      where: {
        tenantId,
        bankAccountId,
        source: "MANUAL",
        asOfDate: { gte: new Date(hint.asOfDate) },
      },
      orderBy: [{ asOfDate: "desc" }, { createdAt: "desc" }],
      select: { asOfDate: true },
    });
    const apply = shouldApplyImportClosingBalance({
      importAsOfDate: new Date(hint.asOfDate),
      protectingManualAsOfDate: protectingManual?.asOfDate ?? null,
    });
    if (apply) {
      await setBalanceSnapshot(tenantId, null, {
        bankAccountId,
        asOfDate: hint.asOfDate,
        balance: hint.balance,
        source: "CALCULATED",
        note: "Saldo informado por Web4Leads (balance del movimiento)",
      });
      appliedHint = true;
    }
  }

  let syncedBalance: number | null = null;
  if (inserted.length > 0 && !appliedHint) {
    const resolved = await syncCurrentBalanceFromMovements(
      tenantId,
      bankAccountId,
    );
    syncedBalance = resolved.resolvedBalanceClp;
  } else if (appliedHint) {
    const acc = await prisma.financeBankAccount.findFirst({
      where: { id: bankAccountId, tenantId },
      select: { currentBalance: true },
    });
    syncedBalance =
      acc?.currentBalance != null ? Number(acc.currentBalance) : hint!.balance;
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
  };
}
