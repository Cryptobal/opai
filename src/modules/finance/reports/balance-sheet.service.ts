import { prisma } from "@/lib/prisma";
import type { FinanceAccountType } from "@prisma/client";
import type {
  BalanceSheetItem,
  BalanceSheetResult,
  BalanceSheetSection,
} from "./shared/types";
import { decimalToNumber } from "./shared/decimal";
import { parseISODate, toISO } from "./shared/period.helper";

interface BalanceFilters {
  costCenterIds?: string[];
}
interface BalanceOptions {
  withPriorMonth?: boolean;
}

const isCurrent = (code: string) => code.startsWith("11") || code.startsWith("21");

export async function getBalanceSheet(
  tenantId: string,
  asOf: string,
  filters: BalanceFilters = {},
  options: BalanceOptions = {}
): Promise<BalanceSheetResult> {
  const result = await computeBalanceAt(tenantId, asOf, filters);
  if (options.withPriorMonth) {
    const d = parseISODate(asOf);
    const prior = new Date(d.getFullYear(), d.getMonth(), 0);
    const prevAsOf = toISO(prior);
    const prevResult = await computeBalanceAt(tenantId, prevAsOf, filters);

    const matchPrev = (section: BalanceSheetSection, prevSection: BalanceSheetSection) => {
      const map = new Map(prevSection.items.map((i) => [i.accountCode, i.amount]));
      section.items.forEach((i) => {
        i.prevAmount = map.get(i.accountCode) ?? 0;
      });
      section.prevTotal = prevSection.total;
    };
    matchPrev(result.asset.current, prevResult.asset.current);
    matchPrev(result.asset.nonCurrent, prevResult.asset.nonCurrent);
    matchPrev(result.liability.current, prevResult.liability.current);
    matchPrev(result.liability.nonCurrent, prevResult.liability.nonCurrent);
    matchPrev(result.equity, prevResult.equity);
    result.asset.prevTotal = prevResult.asset.total;
    result.liability.prevTotal = prevResult.liability.total;
    result.prevAsOf = prevAsOf;
  }
  return result;
}

async function computeBalanceAt(
  tenantId: string,
  asOf: string,
  filters: BalanceFilters
): Promise<BalanceSheetResult> {
  const lines = await prisma.financeJournalLine.findMany({
    where: {
      entry: { tenantId, status: "POSTED", date: { lte: parseISODate(asOf) } },
      ...(filters.costCenterIds?.length ? { costCenterId: { in: filters.costCenterIds } } : {}),
      account: { type: { in: ["ASSET", "LIABILITY", "EQUITY"] } },
    },
    select: {
      debit: true,
      credit: true,
      account: { select: { id: true, code: true, name: true, type: true } },
    },
  });

  const byAcc = new Map<
    string,
    { code: string; name: string; type: FinanceAccountType; amount: number }
  >();
  for (const l of lines) {
    if (!l.account) continue;
    const debit = decimalToNumber(l.debit);
    const credit = decimalToNumber(l.credit);
    const signed =
      l.account.type === "ASSET" ? debit - credit : credit - debit;
    const slot = byAcc.get(l.account.id) ?? {
      code: l.account.code,
      name: l.account.name,
      type: l.account.type,
      amount: 0,
    };
    slot.amount += signed;
    byAcc.set(l.account.id, slot);
  }

  const buildSection = (
    label: string,
    type: FinanceAccountType,
    currentFilter?: boolean
  ): BalanceSheetSection => {
    const items: BalanceSheetItem[] = [];
    let total = 0;
    for (const [id, agg] of byAcc.entries()) {
      if (agg.type !== type) continue;
      if (currentFilter !== undefined) {
        const cur = isCurrent(agg.code);
        if (cur !== currentFilter) continue;
      }
      if (agg.amount === 0) continue;
      items.push({
        accountId: id,
        accountCode: agg.code,
        accountName: agg.name,
        amount: agg.amount,
      });
      total += agg.amount;
    }
    items.sort((a, b) => a.accountCode.localeCompare(b.accountCode));
    return { label, items, total };
  };

  const assetCurrent = buildSection("Activo corriente", "ASSET", true);
  const assetNonCurrent = buildSection("Activo no corriente", "ASSET", false);
  const liabCurrent = buildSection("Pasivo corriente", "LIABILITY", true);
  const liabNonCurrent = buildSection("Pasivo no corriente", "LIABILITY", false);
  const equity = buildSection("Patrimonio", "EQUITY");

  const assetTotal = assetCurrent.total + assetNonCurrent.total;
  const liabTotal = liabCurrent.total + liabNonCurrent.total;
  const equityTotal = equity.total;
  const imbalance = assetTotal - (liabTotal + equityTotal);

  return {
    asOf,
    asset: { current: assetCurrent, nonCurrent: assetNonCurrent, total: assetTotal },
    liability: { current: liabCurrent, nonCurrent: liabNonCurrent, total: liabTotal },
    equity: { ...equity, total: equityTotal },
    isBalanced: Math.abs(imbalance) < 1,
    imbalance,
  };
}
