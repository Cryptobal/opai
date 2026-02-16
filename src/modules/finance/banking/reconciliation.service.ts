import { prisma } from "@/lib/prisma";

export async function listReconciliations(tenantId: string, bankAccountId?: string) {
  const where: Record<string, unknown> = { tenantId };
  if (bankAccountId) where.bankAccountId = bankAccountId;

  return prisma.financeReconciliation.findMany({
    where,
    include: {
      bankAccount: { select: { id: true, bankName: true, accountNumber: true } },
      _count: { select: { matches: true } },
    },
    orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
  });
}

export async function getReconciliation(tenantId: string, id: string) {
  return prisma.financeReconciliation.findFirst({
    where: { id, tenantId },
    include: {
      bankAccount: { select: { id: true, bankName: true, accountNumber: true } },
      matches: {
        include: {
          bankTransaction: true,
          paymentRecord: { select: { id: true, code: true, amount: true, date: true } },
          journalEntry: { select: { id: true, number: true, description: true } },
        },
      },
    },
  });
}

export async function createReconciliation(
  tenantId: string,
  data: { bankAccountId: string; periodYear: number; periodMonth: number; bankBalance: number; bookBalance: number }
) {
  return prisma.financeReconciliation.create({
    data: {
      tenantId,
      bankAccountId: data.bankAccountId,
      periodYear: data.periodYear,
      periodMonth: data.periodMonth,
      bankBalance: data.bankBalance,
      bookBalance: data.bookBalance,
      difference: data.bankBalance - data.bookBalance,
      status: "IN_PROGRESS",
    },
  });
}

export async function addReconciliationMatch(
  reconciliationId: string,
  userId: string,
  data: { bankTransactionId: string; paymentRecordId?: string; journalEntryId?: string; matchType: "AUTO" | "MANUAL" }
) {
  return prisma.$transaction(async (tx) => {
    const match = await tx.financeReconciliationMatch.create({
      data: {
        reconciliationId,
        bankTransactionId: data.bankTransactionId,
        paymentRecordId: data.paymentRecordId ?? null,
        journalEntryId: data.journalEntryId ?? null,
        matchType: data.matchType,
        createdBy: userId,
      },
    });

    // Update bank transaction status
    await tx.financeBankTransaction.update({
      where: { id: data.bankTransactionId },
      data: {
        reconciliationStatus: "MATCHED",
        reconciliationId,
      },
    });

    // Recalculate difference
    const reconc = await tx.financeReconciliation.findUnique({
      where: { id: reconciliationId },
    });

    if (reconc) {
      const unmatchedTxs = await tx.financeBankTransaction.findMany({
        where: {
          bankAccountId: reconc.bankAccountId,
          reconciliationStatus: "UNMATCHED",
          transactionDate: {
            gte: new Date(reconc.periodYear, reconc.periodMonth - 1, 1),
            lt: new Date(reconc.periodYear, reconc.periodMonth, 1),
          },
        },
        select: { amount: true },
      });
      const unmatchedTotal = unmatchedTxs.reduce((sum, t) => sum + t.amount.toNumber(), 0);

      await tx.financeReconciliation.update({
        where: { id: reconciliationId },
        data: { difference: unmatchedTotal },
      });
    }

    return match;
  });
}

export async function completeReconciliation(tenantId: string, id: string, userId: string) {
  return prisma.financeReconciliation.update({
    where: { id },
    data: {
      status: "COMPLETED",
      completedBy: userId,
      completedAt: new Date(),
    },
  });
}

export async function getUnmatchedTransactions(tenantId: string, bankAccountId: string, year: number, month: number) {
  return prisma.financeBankTransaction.findMany({
    where: {
      tenantId,
      bankAccountId,
      reconciliationStatus: "UNMATCHED",
      transactionDate: {
        gte: new Date(year, month - 1, 1),
        lt: new Date(year, month, 1),
      },
    },
    orderBy: { transactionDate: "asc" },
  });
}
