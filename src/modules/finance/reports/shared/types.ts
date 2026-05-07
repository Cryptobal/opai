import type { FinanceAccountType } from "@prisma/client";

/** Tipo de período para reportes financieros. */
export type FinanceReportPeriodType = "month" | "quarter" | "year" | "ytd" | "custom";

export interface FinanceReportPeriod {
  type: FinanceReportPeriodType;
  /** ISO YYYY-MM-DD */
  from: string;
  /** ISO YYYY-MM-DD (inclusivo) */
  to: string;
  /** Etiqueta legible en español, ej: "Octubre 2026", "Q3 2026", "YTD 2026" */
  label: string;
}

export interface FinanceReportComparison {
  prev: FinanceReportPeriod;
  yearAgo?: FinanceReportPeriod;
}

export interface FinanceReportFilters {
  crmAccountIds?: string[];
  installationIds?: string[];
  costCenterIds?: string[];
  sectors?: string[];
  onlyActiveClients?: boolean;
}

export interface FinanceMatrixRow {
  id: string;
  label: string;
  sublabel?: string;
  color?: string;
  monthly: number[];
  total: number;
  meta?: Record<string, unknown>;
}

export interface FinanceMatrixResult {
  period: FinanceReportPeriod;
  rows: FinanceMatrixRow[];
  totalsByMonth: number[];
  grandTotal: number;
  documentsCount: number;
}

export interface IncomeStatementItem {
  accountId: string;
  accountCode: string;
  accountName: string;
  amount: number;
  prevAmount?: number;
  hasUnreconciled?: boolean;
}

export interface IncomeStatementSection {
  label: string;
  accountTypes: FinanceAccountType[];
  items: IncomeStatementItem[];
  total: number;
  prevTotal?: number;
}

export interface IncomeStatementResult {
  period: FinanceReportPeriod;
  comparison?: FinanceReportComparison;
  revenue: IncomeStatementSection;
  cogs: IncomeStatementSection;
  grossProfit: number;
  prevGrossProfit?: number;
  opex: IncomeStatementSection;
  ebitda: number;
  prevEbitda?: number;
  financialResult: IncomeStatementSection;
  beforeTax: number;
  prevBeforeTax?: number;
  taxes: IncomeStatementSection;
  netIncome: number;
  prevNetIncome?: number;
  filters: FinanceReportFilters;
}

export interface BalanceSheetItem {
  accountId: string;
  accountCode: string;
  accountName: string;
  amount: number;
  prevAmount?: number;
}

export interface BalanceSheetSection {
  label: string;
  items: BalanceSheetItem[];
  total: number;
  prevTotal?: number;
}

export interface BalanceSheetResult {
  asOf: string;
  prevAsOf?: string;
  asset: { current: BalanceSheetSection; nonCurrent: BalanceSheetSection; total: number; prevTotal?: number };
  liability: { current: BalanceSheetSection; nonCurrent: BalanceSheetSection; total: number; prevTotal?: number };
  equity: BalanceSheetSection;
  isBalanced: boolean;
  imbalance: number;
}

export interface ProfitabilityRow {
  crmAccountId: string;
  clientName: string;
  sector: string | null;
  revenue: number;
  directCost: number;
  allocatedOpex: number;
  margin: number;
  marginPct: number;
  invoicesCount: number;
  installationsCount: number;
}

export interface ProfitabilityResult {
  period: FinanceReportPeriod;
  rows: ProfitabilityRow[];
  totals: { revenue: number; directCost: number; allocatedOpex: number; margin: number; marginPct: number };
  opexAllocationMethod: "by_revenue" | "by_invoices_count" | "none";
}

export interface DashboardKpis {
  period: FinanceReportPeriod;
  revenue: { value: number; deltaPct: number };
  ebitda: { value: number; deltaPct: number; marginPct: number };
  netIncome: { value: number; deltaPct: number; marginPct: number };
  dso: { value: number; deltaPct: number };
  accountsReceivable: { value: number; deltaPct: number; activeInvoices: number };
  accountsPayable: { value: number; deltaPct: number; activeInvoices: number };
  topClientsConcentration: { topNTotal: number; pct: number; hhi: number };
  trendMonthly: Array<{ month: string; revenue: number; expense: number; margin: number }>;
  topClients: Array<{ id: string; name: string; total: number; pct: number; color: string }>;
}

export interface LedgerEntry {
  date: string;
  entryNumber: number;
  description: string;
  reference: string | null;
  debit: number;
  credit: number;
  runningBalance: number;
  costCenterId: string | null;
  costCenterName: string | null;
}

export interface LedgerResult {
  period: FinanceReportPeriod;
  account: { id: string; code: string; name: string; type: FinanceAccountType; nature: "DEBIT" | "CREDIT" };
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
  entries: LedgerEntry[];
  filters: { costCenterId?: string };
}

export interface LedgerAccountListItem {
  id: string;
  code: string;
  name: string;
  type: FinanceAccountType;
  nature: "DEBIT" | "CREDIT";
  movementsCount: number;
}
