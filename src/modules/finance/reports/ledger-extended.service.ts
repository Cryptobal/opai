import { prisma } from "@/lib/prisma";
import { decimalToNumber } from "./shared/decimal";
import type {
  FinanceReportPeriod,
  LedgerAccountListItem,
  LedgerEntry,
  LedgerResult,
} from "./shared/types";
import { parseISODate } from "./shared/period.helper";

interface LedgerFilters {
  costCenterId?: string;
}

export async function listAccountsForLedger(
  tenantId: string
): Promise<LedgerAccountListItem[]> {
  const rows = await prisma.financeAccountPlan.findMany({
    where: { tenantId, isActive: true, acceptsEntries: true },
    select: {
      id: true,
      code: true,
      name: true,
      type: true,
      nature: true,
      _count: { select: { journalLines: true } },
    },
    orderBy: { code: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    type: r.type,
    nature: r.nature,
    movementsCount: r._count.journalLines,
  }));
}

export async function getExtendedLedger(
  tenantId: string,
  accountId: string,
  period: FinanceReportPeriod,
  filters: LedgerFilters = {}
): Promise<LedgerResult> {
  const account = await prisma.financeAccountPlan.findFirst({
    where: { tenantId, id: accountId },
    select: { id: true, code: true, name: true, type: true, nature: true },
  });
  if (!account) throw new Error("Cuenta no encontrada");

  const fromDate = parseISODate(period.from);
  const toDate = parseISODate(period.to);

  const opening = await prisma.financeJournalLine.aggregate({
    where: {
      accountId,
      entry: { tenantId, status: "POSTED", date: { lt: fromDate } },
      ...(filters.costCenterId ? { costCenterId: filters.costCenterId } : {}),
    },
    _sum: { debit: true, credit: true },
  });
  const openingDebit = decimalToNumber(opening._sum.debit);
  const openingCredit = decimalToNumber(opening._sum.credit);
  const openingBalance =
    account.nature === "DEBIT" ? openingDebit - openingCredit : openingCredit - openingDebit;

  const lines = await prisma.financeJournalLine.findMany({
    where: {
      accountId,
      entry: { tenantId, status: "POSTED", date: { gte: fromDate, lte: toDate } },
      ...(filters.costCenterId ? { costCenterId: filters.costCenterId } : {}),
    },
    select: {
      debit: true,
      credit: true,
      costCenterId: true,
      description: true,
      entry: { select: { number: true, date: true, description: true, reference: true } },
    },
    orderBy: [{ entry: { date: "asc" } }, { entry: { number: "asc" } }],
  });

  const ccIds = Array.from(
    new Set(lines.map((l) => l.costCenterId).filter((v): v is string => Boolean(v)))
  );
  const ccs = ccIds.length
    ? await prisma.financeCostCenter.findMany({
        where: { tenantId, id: { in: ccIds } },
        select: { id: true, name: true },
      })
    : [];
  const ccMap = new Map(ccs.map((c) => [c.id, c.name]));

  let running = openingBalance;
  let totalDebit = 0;
  let totalCredit = 0;
  const entries: LedgerEntry[] = lines.map((l) => {
    const debit = decimalToNumber(l.debit);
    const credit = decimalToNumber(l.credit);
    totalDebit += debit;
    totalCredit += credit;
    const delta = account.nature === "DEBIT" ? debit - credit : credit - debit;
    running += delta;
    return {
      date: (l.entry.date as Date).toISOString().slice(0, 10),
      entryNumber: l.entry.number,
      description: l.description ?? l.entry.description,
      reference: l.entry.reference,
      debit,
      credit,
      runningBalance: running,
      costCenterId: l.costCenterId,
      costCenterName: l.costCenterId ? (ccMap.get(l.costCenterId) ?? null) : null,
    };
  });

  return {
    period,
    account,
    openingBalance,
    totalDebit,
    totalCredit,
    closingBalance: running,
    entries,
    filters,
  };
}
