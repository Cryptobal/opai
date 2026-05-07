"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, DollarSign, TrendingUp, Receipt, Wallet } from "lucide-react";
import type {
  FinanceReportPeriod,
  ProfitabilityResult,
} from "@/modules/finance/reports/shared/types";
import { ReportsPeriodPicker } from "./ReportsPeriodPicker";
import { ExportMenu } from "./ExportMenu";
import { KPICard } from "./shared/KPICard";
import { RankBar } from "./shared/RankBar";
import { EmptyReport } from "./shared/EmptyReport";

interface Props {
  initialPeriod: FinanceReportPeriod;
  initialData: ProfitabilityResult;
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

const METHODS = [
  { id: "by_revenue" as const, label: "Por ingresos" },
  { id: "by_invoices_count" as const, label: "Por # facturas" },
  { id: "none" as const, label: "Sin opex" },
];

export function ProfitabilityClient({ initialPeriod, initialData }: Props) {
  const router = useRouter();
  const [period, setPeriod] = useState(initialPeriod);
  const [data, setData] = useState(initialData);
  const [method, setMethod] = useState(initialData.opexAllocationMethod);
  const [, startTransition] = useTransition();

  const refetch = (
    p: FinanceReportPeriod,
    m: ProfitabilityResult["opexAllocationMethod"]
  ) => {
    setPeriod(p);
    setMethod(m);
    startTransition(async () => {
      const res = await fetch("/api/finance/reports/profitability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period: p, filters: {}, opexAllocationMethod: m }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) setData(json.data);
      }
    });
  };

  const negativeCount = useMemo(
    () => data.rows.filter((r) => r.margin < 0).length,
    [data.rows]
  );
  const maxAbsMargin = useMemo(
    () => Math.max(...data.rows.map((r) => Math.abs(r.margin)), 1),
    [data.rows]
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <ReportsPeriodPicker value={period} onChange={(p) => refetch(p, method)} />
          <div className="inline-flex rounded-lg border overflow-hidden" style={{ borderColor: "var(--ds-border)" }}>
            {METHODS.map((m) => (
              <button
                key={m.id}
                onClick={() => refetch(period, m.id)}
                className="h-9 px-3 text-[12.5px]"
                style={{
                  background:
                    method === m.id
                      ? "color-mix(in oklab, var(--ds-tint-amber) 15%, transparent)"
                      : "var(--ds-surface)",
                  color: method === m.id ? "var(--ds-tint-amber)" : "var(--ds-text-2)",
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <ExportMenu
          endpoint="/api/finance/reports/profitability/export"
          payload={{ period, filters: {}, opexAllocationMethod: method }}
          filenameBase={`rentabilidad-${period.from}-${period.to}`}
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard
          label="Ingresos totales"
          value={fmtCompact(data.totals.revenue)}
          icon={DollarSign}
          tone="emerald"
        />
        <KPICard
          label="Costo directo"
          value={fmtCompact(data.totals.directCost)}
          icon={Receipt}
          tone="rose"
        />
        <KPICard
          label="Opex prorrateado"
          value={fmtCompact(data.totals.allocatedOpex)}
          icon={Wallet}
          tone="amber"
        />
        <KPICard
          label="Margen total"
          value={fmtCompact(data.totals.margin)}
          icon={TrendingUp}
          tone={data.totals.margin >= 0 ? "emerald" : "rose"}
          sub={`${data.totals.marginPct.toFixed(1)}%`}
        />
      </div>

      {negativeCount >= 3 && (
        <div
          className="flex items-center gap-2.5 rounded-lg border p-3 text-[12.5px]"
          style={{
            borderColor: "var(--ds-tint-amber)",
            background: "color-mix(in oklab, var(--ds-tint-amber) 10%, transparent)",
          }}
        >
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          <span>
            <strong>{negativeCount} clientes</strong> con margen negativo en este período. Revisar
            pricing o costos directos.
          </span>
        </div>
      )}

      {data.rows.length === 0 ? (
        <EmptyReport
          icon={TrendingUp}
          title="Sin datos para el período"
          description="No hay ventas/compras suficientes para calcular rentabilidad."
        />
      ) : (
        <div
          className="rounded-xl border bg-ds-surface overflow-hidden"
          style={{ borderColor: "var(--ds-border)" }}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px] tabular-nums" style={{ minWidth: 900 }}>
              <thead>
                <tr style={{ background: "var(--ds-bg-2)" }}>
                  <th className="px-3 py-2 text-left font-mono uppercase tracking-wider text-[10px] text-ds-text-3 w-12">
                    #
                  </th>
                  <th className="px-3 py-2 text-left font-mono uppercase tracking-wider text-[10px] text-ds-text-3">
                    Cliente
                  </th>
                  <th className="px-3 py-2 text-right font-mono uppercase tracking-wider text-[10px] text-ds-text-3">
                    Ventas
                  </th>
                  <th className="px-3 py-2 text-right font-mono uppercase tracking-wider text-[10px] text-ds-text-3">
                    Costo
                  </th>
                  <th className="px-3 py-2 text-right font-mono uppercase tracking-wider text-[10px] text-ds-text-3">
                    Opex
                  </th>
                  <th className="px-3 py-2 text-right font-mono uppercase tracking-wider text-[10px] text-ds-text-3">
                    Margen
                  </th>
                  <th className="px-3 py-2 text-left font-mono uppercase tracking-wider text-[10px] text-ds-text-3 w-32">
                    %
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, i) => {
                  const tone = row.margin >= 0 ? "emerald" : "rose";
                  return (
                    <tr
                      key={row.crmAccountId}
                      className="border-t cursor-pointer hover:bg-ds-bg-2/40"
                      style={{ borderColor: "var(--ds-border-soft)" }}
                      onClick={() => router.push(`/finanzas/reportes/ventas/${row.crmAccountId}`)}
                    >
                      <td className="px-3 py-2 text-ds-text-3">{i + 1}</td>
                      <td className="px-3 py-2">
                        <p className="text-ds-text-1">{row.clientName}</p>
                        {row.sector && (
                          <p className="text-[10.5px] text-ds-text-4">{row.sector}</p>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right text-ds-text-1">
                        {fmtCompact(row.revenue)}
                      </td>
                      <td className="px-3 py-2 text-right text-ds-text-1">
                        {fmtCompact(row.directCost)}
                      </td>
                      <td className="px-3 py-2 text-right text-ds-text-1">
                        {fmtCompact(row.allocatedOpex)}
                      </td>
                      <td
                        className="px-3 py-2 text-right font-semibold"
                        style={{
                          color:
                            tone === "emerald"
                              ? "var(--ds-tint-emerald)"
                              : "var(--ds-tint-rose)",
                        }}
                      >
                        {fmtCompact(row.margin)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span
                            className="text-[11px] font-mono w-12 shrink-0"
                            style={{
                              color:
                                tone === "emerald"
                                  ? "var(--ds-tint-emerald)"
                                  : "var(--ds-tint-rose)",
                            }}
                          >
                            {row.marginPct.toFixed(1)}%
                          </span>
                          <RankBar value={row.margin} max={maxAbsMargin} tone={tone} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: "var(--ds-bg-2)" }} className="border-t">
                  <td className="px-3 py-2"></td>
                  <td className="px-3 py-2 font-semibold text-ds-text-1">Total</td>
                  <td className="px-3 py-2 text-right font-semibold text-ds-text-1">
                    {fmtCompact(data.totals.revenue)}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold text-ds-text-1">
                    {fmtCompact(data.totals.directCost)}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold text-ds-text-1">
                    {fmtCompact(data.totals.allocatedOpex)}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold text-ds-text-1">
                    {fmtCompact(data.totals.margin)}
                  </td>
                  <td className="px-3 py-2 font-semibold text-ds-text-1">
                    {data.totals.marginPct.toFixed(1)}%
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
