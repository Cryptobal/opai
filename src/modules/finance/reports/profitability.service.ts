import type {
  FinanceReportFilters,
  FinanceReportPeriod,
  ProfitabilityResult,
  ProfitabilityRow,
} from "./shared/types";
import { getSalesMatrix } from "./sales-matrix.service";
import { getPurchasesMatrix } from "./purchases-matrix.service";
import { getIncomeStatement } from "./income-statement.service";
import { safePct } from "./shared/decimal";

interface ProfitOptions {
  opexAllocationMethod?: "by_revenue" | "by_invoices_count" | "none";
}

const NO_CLIENT_ID = "__no_client__";

export async function getProfitability(
  tenantId: string,
  period: FinanceReportPeriod,
  filters: FinanceReportFilters = {},
  options: ProfitOptions = {}
): Promise<ProfitabilityResult> {
  const method = options.opexAllocationMethod ?? "by_revenue";
  const [sales, purchases, eerr] = await Promise.all([
    getSalesMatrix(tenantId, period, filters),
    getPurchasesMatrix(tenantId, period, filters),
    getIncomeStatement(tenantId, period, filters),
  ]);

  const totalOpex = eerr.opex.total;
  const totalRevenue = sales.grandTotal;
  const totalInvoices = sales.documentsCount;
  const purchasesByClient = new Map(purchases.rows.map((r) => [r.id, r]));

  const rows: ProfitabilityRow[] = sales.rows
    .filter((r) => r.id !== NO_CLIENT_ID)
    .map((salesRow) => {
      const purchaseRow = purchasesByClient.get(salesRow.id);
      const revenue = salesRow.total;
      const directCost = purchaseRow?.total ?? 0;
      let allocatedOpex = 0;
      if (method === "by_revenue" && totalRevenue > 0) {
        allocatedOpex = totalOpex * (revenue / totalRevenue);
      } else if (method === "by_invoices_count" && totalInvoices > 0) {
        const clientInvCount = salesRow.monthly.filter((v) => v > 0).length;
        allocatedOpex = totalOpex * (clientInvCount / totalInvoices);
      }
      const margin = revenue - directCost - allocatedOpex;
      const marginPct = safePct(margin, revenue, 1);
      return {
        crmAccountId: salesRow.id,
        clientName: salesRow.label,
        sector: (salesRow.meta?.sector as string | null) ?? null,
        revenue,
        directCost,
        allocatedOpex,
        margin,
        marginPct,
        invoicesCount: salesRow.monthly.filter((v) => v > 0).length,
        installationsCount: (salesRow.meta?.installationsCount as number | undefined) ?? 0,
      };
    });

  rows.sort((a, b) => b.margin - a.margin);

  const totals = rows.reduce(
    (acc, r) => ({
      revenue: acc.revenue + r.revenue,
      directCost: acc.directCost + r.directCost,
      allocatedOpex: acc.allocatedOpex + r.allocatedOpex,
      margin: acc.margin + r.margin,
      marginPct: 0,
    }),
    { revenue: 0, directCost: 0, allocatedOpex: 0, margin: 0, marginPct: 0 }
  );
  totals.marginPct = safePct(totals.margin, totals.revenue);

  return { period, rows, totals, opexAllocationMethod: method };
}
