/**
 * Ledger Service
 * Generate general ledger for a specific account
 */

import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";

/**
 * Get account ledger with running balance
 * Balance respects account nature (DEBIT accounts: balance = sum(debit) - sum(credit))
 */
export async function getAccountLedger(
  tenantId: string,
  accountId: string,
  dateFrom?: string,
  dateTo?: string
) {
  // Get the account to know its nature
  const account = await prisma.financeAccountPlan.findFirst({
    where: { id: accountId, tenantId },
  });
  if (!account) throw new Error("Cuenta no encontrada");

  const where: any = {
    accountId,
    entry: { tenantId, status: "POSTED" },
  };
  if (dateFrom || dateTo) {
    where.entry.date = {};
    if (dateFrom) where.entry.date.gte = new Date(dateFrom);
    if (dateTo) where.entry.date.lte = new Date(dateTo);
  }

  const lines = await prisma.financeJournalLine.findMany({
    where,
    orderBy: { entry: { date: "asc" } },
    include: {
      entry: {
        select: { number: true, date: true, description: true, reference: true },
      },
    },
  });

  // Calculate running balance based on account nature
  let runningBalance = new Decimal(0);
  const isDebitNature = account.nature === "DEBIT";

  const ledger = lines.map((line) => {
    if (isDebitNature) {
      runningBalance = runningBalance.add(line.debit).sub(line.credit);
    } else {
      runningBalance = runningBalance.add(line.credit).sub(line.debit);
    }

    return {
      date: line.entry.date,
      entryNumber: line.entry.number,
      description: line.entry.description,
      reference: line.entry.reference,
      lineDescription: line.description,
      debit: line.debit,
      credit: line.credit,
      balance: new Decimal(runningBalance.toString()),
    };
  });

  return {
    account: {
      id: account.id,
      code: account.code,
      name: account.name,
      type: account.type,
      nature: account.nature,
    },
    entries: ledger,
    totalDebit: ledger.reduce((sum, l) => sum.add(l.debit), new Decimal(0)),
    totalCredit: ledger.reduce((sum, l) => sum.add(l.credit), new Decimal(0)),
    finalBalance: runningBalance,
  };
}
