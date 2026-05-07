import { prisma } from "@/lib/prisma";
import type { FinanceAccountType } from "@prisma/client";
import type {
  FinanceReportFilters,
  FinanceReportPeriod,
  IncomeStatementItem,
  IncomeStatementResult,
  IncomeStatementSection,
} from "./shared/types";
import { decimalToNumber } from "./shared/decimal";
import { parseISODate, previousPeriod } from "./shared/period.helper";

interface BuildOptions {
  withComparison?: boolean;
  /** Reservado para fase 2 — incluir DTEs con cuenta sin journal POSTED. */
  includeUnreconciled?: boolean;
}

/**
 * Convención chilena:
 *  - REVENUE: type=REVENUE
 *  - COST: type=COST (costos directos del servicio)
 *  - EXPENSE: type=EXPENSE
 *      · code 71x / 72x: resultado financiero
 *      · code 81x: impuestos
 *      · resto: opex genérico
 */
export async function getIncomeStatement(
  tenantId: string,
  period: FinanceReportPeriod,
  filters: FinanceReportFilters = {},
  options: BuildOptions = {}
): Promise<IncomeStatementResult> {
  const periodFromDate = parseISODate(period.from);
  const periodToDate = parseISODate(period.to);

  const lines = await prisma.financeJournalLine.findMany({
    where: {
      entry: { tenantId, status: "POSTED", date: { gte: periodFromDate, lte: periodToDate } },
      ...(filters.costCenterIds?.length ? { costCenterId: { in: filters.costCenterIds } } : {}),
    },
    select: {
      debit: true,
      credit: true,
      costCenterId: true,
      accountId: true,
      account: { select: { id: true, code: true, name: true, type: true, nature: true } },
      entry: { select: { date: true } },
    },
  });

  const byAccount = new Map<
    string,
    { code: string; name: string; type: FinanceAccountType; amount: number }
  >();
  for (const l of lines) {
    if (!l.account) continue;
    const debit = decimalToNumber(l.debit);
    const credit = decimalToNumber(l.credit);
    let signed = 0;
    if (l.account.type === "REVENUE") signed = credit - debit;
    else if (l.account.type === "COST" || l.account.type === "EXPENSE") signed = debit - credit;
    else continue;
    const slot = byAccount.get(l.account.id) ?? {
      code: l.account.code,
      name: l.account.name,
      type: l.account.type,
      amount: 0,
    };
    slot.amount += signed;
    byAccount.set(l.account.id, slot);
  }

  const isFinancial = (code: string) => code.startsWith("71") || code.startsWith("72");
  const isTax = (code: string) => code.startsWith("81");

  const buildSection = (
    label: string,
    types: FinanceAccountType[],
    pred?: (code: string) => boolean,
    exclude?: (code: string) => boolean
  ): IncomeStatementSection => {
    const items: IncomeStatementItem[] = [];
    let total = 0;
    for (const [id, agg] of byAccount.entries()) {
      if (!types.includes(agg.type)) continue;
      if (pred && !pred(agg.code)) continue;
      if (exclude && exclude(agg.code)) continue;
      items.push({
        accountId: id,
        accountCode: agg.code,
        accountName: agg.name,
        amount: agg.amount,
      });
      total += agg.amount;
    }
    items.sort((a, b) => a.accountCode.localeCompare(b.accountCode));
    return { label, accountTypes: types, items, total };
  };

  const revenue = buildSection("Ingresos operacionales", ["REVENUE"]);
  const cogs = buildSection("Costos directos", ["COST"]);
  const opex = buildSection(
    "Gastos operacionales",
    ["EXPENSE"],
    undefined,
    (c) => isFinancial(c) || isTax(c)
  );
  const financialResult = buildSection("Resultado financiero", ["EXPENSE"], isFinancial);
  const taxes = buildSection("Impuestos", ["EXPENSE"], isTax);

  const grossProfit = revenue.total - cogs.total;
  const ebitda = grossProfit - opex.total;
  const beforeTax = ebitda - financialResult.total;
  const netIncome = beforeTax - taxes.total;

  let comparison: IncomeStatementResult["comparison"];
  let prevGrossProfit: number | undefined;
  let prevEbitda: number | undefined;
  let prevBeforeTax: number | undefined;
  let prevNetIncome: number | undefined;

  if (options.withComparison) {
    const prev = previousPeriod(period);
    const prevResult = await getIncomeStatement(tenantId, prev, filters, { withComparison: false });
    prevGrossProfit = prevResult.grossProfit;
    prevEbitda = prevResult.ebitda;
    prevBeforeTax = prevResult.beforeTax;
    prevNetIncome = prevResult.netIncome;

    const matchPrev = (section: IncomeStatementSection, prevSection: IncomeStatementSection) => {
      const map = new Map(prevSection.items.map((i) => [i.accountCode, i.amount]));
      section.items.forEach((i) => {
        i.prevAmount = map.get(i.accountCode) ?? 0;
      });
      section.prevTotal = prevSection.total;
    };
    matchPrev(revenue, prevResult.revenue);
    matchPrev(cogs, prevResult.cogs);
    matchPrev(opex, prevResult.opex);
    matchPrev(financialResult, prevResult.financialResult);
    matchPrev(taxes, prevResult.taxes);
    comparison = { prev };
  }

  return {
    period,
    comparison,
    revenue,
    cogs,
    grossProfit,
    prevGrossProfit,
    opex,
    ebitda,
    prevEbitda,
    financialResult,
    beforeTax,
    prevBeforeTax,
    taxes,
    netIncome,
    prevNetIncome,
    filters,
  };
}
