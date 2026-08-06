import type { FlowRowConfigItem } from "@/modules/finance/cashflow/flow-rows-config.service";
import type { FlowHealthReportV2 } from "@/modules/finance/cashflow/flow-health.types";
import { normalizeFlowHealthReport } from "@/modules/finance/cashflow/flow-health.types";

export function normalizeHealth(raw: unknown): FlowHealthReportV2 | null {
  if (!raw || typeof raw !== "object") return null;
  return normalizeFlowHealthReport(raw as Parameters<typeof normalizeFlowHealthReport>[0]);
}

export function rowHasProblem(
  row: FlowRowConfigItem,
  health: FlowHealthReportV2 | null,
): boolean {
  if (row.section === "INGRESOS") return false;
  if (row.accounts.length === 0) {
    const isBandeja =
      row.canonicalKey === "BANDEJA_EGRESO" ||
      row.name === "Otros egresos" ||
      row.name === "Otros ingresos";
    if (!isBandeja) return true;
  }
  if (!health) return false;
  if (health.rowsWithoutAccounts.some((r) => r.id === row.id)) return true;
  if (
    health.expenseRowsOnNonExpenseAccounts.some((x) => x.rowId === row.id)
  ) {
    return true;
  }
  const ambiguous = health.ambiguousAccounts.some((a) =>
    a.rows.some((r) => r.id === row.id),
  );
  return ambiguous;
}

export function countProblems(
  rows: FlowRowConfigItem[],
  health: FlowHealthReportV2 | null,
): number {
  return rows.filter((r) => rowHasProblem(r, health)).length;
}
