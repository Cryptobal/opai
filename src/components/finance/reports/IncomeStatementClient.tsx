"use client";

import { useState, useTransition, useMemo, Fragment } from "react";
import { ChevronRight, TrendingUp, Sparkles, Wallet, DollarSign } from "lucide-react";
import type {
  FinanceReportPeriod,
  IncomeStatementResult,
  IncomeStatementSection,
} from "@/modules/finance/reports/shared/types";
import { KPICard, KPIGrid, Surface, SectionHeader } from "@/components/opai-ds";
import { cn } from "@/lib/utils";
import { ReportsPeriodPicker } from "./ReportsPeriodPicker";
import { ExportMenu } from "./ExportMenu";

interface Props {
  initialPeriod: FinanceReportPeriod;
  initialData: IncomeStatementResult;
  initialCompare?: boolean;
}

const fmtCLP = (n: number): string =>
  "$" + new Intl.NumberFormat("es-CL").format(Math.round(n));

const fmtCLPShort = (n: number): string => {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}MM`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${abs}`;
};

const safePctLabel = (num: number, denom: number): string => {
  if (!denom) return "0%";
  return `${((num / denom) * 100).toFixed(1)}%`;
};

const fmtDelta = (curr: number, prev: number): string => {
  if (!prev) return curr ? "+100%" : "0%";
  const v = ((curr - prev) / Math.abs(prev)) * 100;
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
};

interface SectionRowProps {
  section: IncomeStatementSection;
  showComparison: boolean;
  accent: "ok" | "warn" | "danger" | "brand" | "info";
  defaultOpen?: boolean;
}

const ACCENT_TEXT = {
  ok: "text-status-ok-fg",
  warn: "text-status-warn-fg",
  danger: "text-status-danger-fg",
  brand: "text-primary",
  info: "text-status-info-fg",
};

function SectionRows({ section, showComparison, accent, defaultOpen = true }: SectionRowProps) {
  const [open, setOpen] = useState(defaultOpen);
  const accentClass = ACCENT_TEXT[accent];
  return (
    <Fragment>
      <tr
        className="border-t border-ds-border-subtle cursor-pointer hover:bg-ds-surface-2/50"
        onClick={() => setOpen((o) => !o)}
      >
        <td className="px-3 py-2.5">
          <div className={cn("flex items-center gap-2 font-semibold", accentClass)}>
            <ChevronRight
              className="w-3.5 h-3.5 transition-transform"
              style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
            />
            {section.label}
          </div>
        </td>
        {showComparison && (
          <td className={cn("px-3 py-2.5 text-right ds-num font-semibold", accentClass)}>
            {section.prevTotal !== undefined ? fmtCLP(section.prevTotal) : ""}
          </td>
        )}
        <td className={cn("px-3 py-2.5 text-right ds-num font-semibold", accentClass)}>
          {fmtCLP(section.total)}
        </td>
        {showComparison && (
          <td className={cn("px-3 py-2.5 text-right ds-num font-semibold text-xs", accentClass)}>
            {section.prevTotal !== undefined ? fmtDelta(section.total, section.prevTotal) : "—"}
          </td>
        )}
      </tr>
      {open &&
        section.items.map((it) => (
          <tr key={it.accountId} className="border-t border-ds-border-subtle">
            <td className="px-3 py-2 pl-10">
              <p className="text-ds-text-1 text-sm">{it.accountName}</p>
              <p className="text-[10.5px] text-ds-text-4 font-mono">{it.accountCode}</p>
            </td>
            {showComparison && (
              <td className="px-3 py-2 text-right ds-num text-ds-text-2 text-sm">
                {it.prevAmount !== undefined ? fmtCLP(it.prevAmount) : ""}
              </td>
            )}
            <td className="px-3 py-2 text-right ds-num text-ds-text-1 text-sm">
              {fmtCLP(it.amount)}
            </td>
            {showComparison && (
              <td className="px-3 py-2 text-right ds-num text-ds-text-3 text-xs">
                {it.prevAmount !== undefined ? fmtDelta(it.amount, it.prevAmount) : "—"}
              </td>
            )}
          </tr>
        ))}
    </Fragment>
  );
}

interface SummaryProps {
  label: string;
  value: number;
  prev?: number;
  variant: "ok" | "brand" | "info";
  big?: boolean;
  showComparison: boolean;
}

const SUMMARY_BG = {
  ok: "bg-status-ok-soft/50",
  brand: "bg-primary/10",
  info: "bg-status-info-soft/50",
};
const SUMMARY_FG = {
  ok: "text-status-ok-fg",
  brand: "text-primary",
  info: "text-status-info-fg",
};

function SummaryRow({ label, value, prev, variant, big, showComparison }: SummaryProps) {
  return (
    <tr className={cn("border-t border-ds-border-default", SUMMARY_BG[variant])}>
      <td
        className={cn(
          "px-3 py-2 font-semibold uppercase tracking-wider",
          big ? "text-base" : "text-xs",
          SUMMARY_FG[variant]
        )}
      >
        {label}
      </td>
      {showComparison && (
        <td className={cn("px-3 py-2 text-right ds-num font-semibold", SUMMARY_FG[variant])}>
          {prev !== undefined ? fmtCLP(prev) : ""}
        </td>
      )}
      <td
        className={cn(
          "px-3 py-2 text-right ds-num font-bold",
          big ? "text-base" : "text-sm",
          SUMMARY_FG[variant]
        )}
      >
        {fmtCLP(value)}
      </td>
      {showComparison && (
        <td className={cn("px-3 py-2 text-right ds-num font-semibold text-xs", SUMMARY_FG[variant])}>
          {prev !== undefined ? fmtDelta(value, prev) : "—"}
        </td>
      )}
    </tr>
  );
}

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

  const sections = useMemo(
    () => [
      { section: data.revenue, accent: "ok" as const },
      { section: data.cogs, accent: "danger" as const },
    ],
    [data]
  );
  const opex = useMemo(
    () => [{ section: data.opex, accent: "warn" as const }],
    [data]
  );
  const finResultAndTax = useMemo(
    () => [
      { section: data.financialResult, accent: "info" as const, defaultOpen: false },
      { section: data.taxes, accent: "info" as const, defaultOpen: false },
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

      <KPIGrid>
        <KPICard
          label="Ingresos"
          value={<span title={fmtCLP(data.revenue.total)}>{fmtCLPShort(data.revenue.total)}</span>}
          icon={DollarSign}
          iconTone="emerald"
          variant="brand"
        />
        <KPICard
          label="Margen bruto"
          value={<span title={fmtCLP(data.grossProfit)}>{fmtCLPShort(data.grossProfit)}</span>}
          hint={safePctLabel(data.grossProfit, data.revenue.total)}
          icon={TrendingUp}
          iconTone="emerald"
          variant={data.grossProfit >= 0 ? "ok" : "danger"}
        />
        <KPICard
          label="EBITDA"
          value={<span title={fmtCLP(data.ebitda)}>{fmtCLPShort(data.ebitda)}</span>}
          hint={safePctLabel(data.ebitda, data.revenue.total)}
          icon={Sparkles}
          iconTone="sky"
          variant={data.ebitda >= 0 ? "ok" : "danger"}
        />
        <KPICard
          label="Utilidad neta"
          value={<span title={fmtCLP(data.netIncome)}>{fmtCLPShort(data.netIncome)}</span>}
          hint={safePctLabel(data.netIncome, data.revenue.total)}
          icon={Wallet}
          iconTone={data.netIncome >= 0 ? "emerald" : "rose"}
          variant={data.netIncome >= 0 ? "ok" : "danger"}
        />
      </KPIGrid>

      <Surface padding="none" elevation={1} className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-ds-surface-2">
              <tr>
                <th className="px-3 py-2 text-left text-[10px] font-mono uppercase tracking-wider text-ds-text-3">
                  Cuenta
                </th>
                {compare && (
                  <th className="px-3 py-2 text-right text-[10px] font-mono uppercase tracking-wider text-ds-text-3">
                    Per. anterior
                  </th>
                )}
                <th className="px-3 py-2 text-right text-[10px] font-mono uppercase tracking-wider text-ds-text-3">
                  {period.label}
                </th>
                {compare && (
                  <th className="px-3 py-2 text-right text-[10px] font-mono uppercase tracking-wider text-ds-text-3">
                    Δ%
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {sections.map((s) => (
                <SectionRows
                  key={s.section.label}
                  section={s.section}
                  showComparison={compare}
                  accent={s.accent}
                />
              ))}
              <SummaryRow
                label="Margen bruto"
                value={data.grossProfit}
                prev={data.prevGrossProfit}
                variant="ok"
                showComparison={compare}
              />
              {opex.map((s) => (
                <SectionRows
                  key={s.section.label}
                  section={s.section}
                  showComparison={compare}
                  accent={s.accent}
                />
              ))}
              <SummaryRow
                label="EBITDA"
                value={data.ebitda}
                prev={data.prevEbitda}
                variant="brand"
                big
                showComparison={compare}
              />
              {finResultAndTax.map((s) => (
                <SectionRows
                  key={s.section.label}
                  section={s.section}
                  showComparison={compare}
                  accent={s.accent}
                  defaultOpen={s.defaultOpen}
                />
              ))}
              <SummaryRow
                label="Utilidad neta"
                value={data.netIncome}
                prev={data.prevNetIncome}
                variant="ok"
                big
                showComparison={compare}
              />
            </tbody>
          </table>
        </div>
      </Surface>
    </div>
  );
}
