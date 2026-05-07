"use client";

import { useState, useTransition, useMemo } from "react";
import type {
  FinanceReportPeriod,
  IncomeStatementResult,
} from "@/modules/finance/reports/shared/types";
import { ReportsPeriodPicker } from "./ReportsPeriodPicker";
import { ExportMenu } from "./ExportMenu";
import { KPICard } from "./shared/KPICard";
import {
  HierarchicalTable,
  type HierarchicalSection,
} from "./shared/HierarchicalTable";
import { TrendingUp, Sparkles, Wallet, DollarSign } from "lucide-react";

interface Props {
  initialPeriod: FinanceReportPeriod;
  initialData: IncomeStatementResult;
  initialCompare?: boolean;
}

const fmtCLP = (n: number): string =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(n);

const fmtCompact = (n: number): string => {
  const a = Math.abs(n);
  if (a >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return fmtCLP(n);
};

const safePct = (num: number, denom: number): string => {
  if (!denom) return "0%";
  return `${((num / denom) * 100).toFixed(1)}%`;
};

export function IncomeStatementClient({
  initialPeriod,
  initialData,
  initialCompare = true,
}: Props) {
  const [period, setPeriod] = useState(initialPeriod);
  const [data, setData] = useState(initialData);
  const [compare, setCompare] = useState(initialCompare);
  const [, startTransition] = useTransition();

  const refetch = (p: FinanceReportPeriod, withComparison: boolean) => {
    setPeriod(p);
    setCompare(withComparison);
    startTransition(async () => {
      const res = await fetch("/api/finance/reports/income-statement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period: p, filters: {}, withComparison }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) setData(json.data);
      }
    });
  };

  const sections: HierarchicalSection[] = useMemo(
    () => [
      {
        id: "revenue",
        label: data.revenue.label,
        total: data.revenue.total,
        prevTotal: data.revenue.prevTotal,
        accent: "var(--ds-tint-emerald)",
        items: data.revenue.items.map((it) => ({
          id: it.accountId,
          label: it.accountName,
          sublabel: it.accountCode,
          amount: it.amount,
          prevAmount: it.prevAmount,
        })),
      },
      {
        id: "cogs",
        label: data.cogs.label,
        total: data.cogs.total,
        prevTotal: data.cogs.prevTotal,
        accent: "var(--ds-tint-rose)",
        items: data.cogs.items.map((it) => ({
          id: it.accountId,
          label: it.accountName,
          sublabel: it.accountCode,
          amount: it.amount,
          prevAmount: it.prevAmount,
        })),
      },
      {
        id: "opex",
        label: data.opex.label,
        total: data.opex.total,
        prevTotal: data.opex.prevTotal,
        accent: "var(--ds-tint-amber)",
        items: data.opex.items.map((it) => ({
          id: it.accountId,
          label: it.accountName,
          sublabel: it.accountCode,
          amount: it.amount,
          prevAmount: it.prevAmount,
        })),
      },
      {
        id: "financialResult",
        label: data.financialResult.label,
        total: data.financialResult.total,
        prevTotal: data.financialResult.prevTotal,
        accent: "var(--ds-tint-violet)",
        collapsedByDefault: true,
        items: data.financialResult.items.map((it) => ({
          id: it.accountId,
          label: it.accountName,
          sublabel: it.accountCode,
          amount: it.amount,
          prevAmount: it.prevAmount,
        })),
      },
      {
        id: "taxes",
        label: data.taxes.label,
        total: data.taxes.total,
        prevTotal: data.taxes.prevTotal,
        accent: "var(--ds-tint-sky)",
        collapsedByDefault: true,
        items: data.taxes.items.map((it) => ({
          id: it.accountId,
          label: it.accountName,
          sublabel: it.accountCode,
          amount: it.amount,
          prevAmount: it.prevAmount,
        })),
      },
    ],
    [data]
  );

  const summaryRows = useMemo(
    () => [
      {
        id: "gross",
        label: "MARGEN BRUTO",
        value: data.grossProfit,
        prev: data.prevGrossProfit,
        accent: "#10B981",
        big: false,
      },
      {
        id: "ebitda",
        label: "EBITDA",
        value: data.ebitda,
        prev: data.prevEbitda,
        accent: "#0066FF",
        big: true,
      },
      {
        id: "beforeTax",
        label: "ANTES DE IMPUESTOS",
        value: data.beforeTax,
        prev: data.prevBeforeTax,
        accent: "#8B5CF6",
        big: false,
      },
      {
        id: "net",
        label: "UTILIDAD NETA",
        value: data.netIncome,
        prev: data.prevNetIncome,
        accent: "#10B981",
        big: true,
      },
    ],
    [data]
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <ReportsPeriodPicker
          value={period}
          onChange={(p) => refetch(p, compare)}
          showCompare
          compareEnabled={compare}
          onCompareToggle={(v) => refetch(period, v)}
        />
        <ExportMenu
          endpoint="/api/finance/reports/income-statement/export"
          payload={{ period, filters: {}, withComparison: compare }}
          filenameBase={`eerr-${period.from}-${period.to}`}
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard
          label="Ingresos"
          value={fmtCompact(data.revenue.total)}
          icon={DollarSign}
          tone="emerald"
        />
        <KPICard
          label="Margen bruto"
          value={fmtCompact(data.grossProfit)}
          icon={TrendingUp}
          tone="emerald"
          sub={safePct(data.grossProfit, data.revenue.total)}
        />
        <KPICard
          label="EBITDA"
          value={fmtCompact(data.ebitda)}
          icon={Sparkles}
          tone="sky"
          sub={safePct(data.ebitda, data.revenue.total)}
        />
        <KPICard
          label="Utilidad neta"
          value={fmtCompact(data.netIncome)}
          icon={Wallet}
          tone={data.netIncome >= 0 ? "emerald" : "rose"}
          sub={safePct(data.netIncome, data.revenue.total)}
        />
      </div>

      <HierarchicalTable
        sections={sections}
        showComparison={compare}
        fmt={fmtCLP}
        summaryRows={summaryRows}
      />
    </div>
  );
}
