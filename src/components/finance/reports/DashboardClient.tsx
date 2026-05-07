"use client";

import { useState, useTransition } from "react";
import {
  DollarSign,
  Wallet,
  Receipt,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import type {
  DashboardKpis,
  FinanceReportPeriod,
} from "@/modules/finance/reports/shared/types";
import { KPICard, KPIGrid, Surface, SectionHeader } from "@/components/opai-ds";
import { ReportsPeriodPicker } from "./ReportsPeriodPicker";
import { ExportMenu } from "./ExportMenu";

interface Props {
  initialPeriod: FinanceReportPeriod;
  initialKpis: DashboardKpis;
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

export function DashboardClient({ initialPeriod, initialKpis }: Props) {
  const [period, setPeriod] = useState(initialPeriod);
  const [kpis, setKpis] = useState(initialKpis);
  const [isPending, startTransition] = useTransition();

  const refetch = (p: FinanceReportPeriod) => {
    setPeriod(p);
    startTransition(async () => {
      const res = await fetch("/api/finance/reports/dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period: p, filters: {} }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) setKpis(json.data);
      }
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <ReportsPeriodPicker value={period} onChange={refetch} />
        <ExportMenu
          endpoint="/api/finance/reports/dashboard/export"
          payload={{ period, filters: {} }}
          filenameBase={`dashboard-${period.from}-${period.to}`}
        />
      </div>

      <KPIGrid>
        <KPICard
          label="Ingresos"
          value={
            <span title={fmtCLP(kpis.revenue.value)}>{fmtCLPShort(kpis.revenue.value)}</span>
          }
          trend={kpis.revenue.deltaPct}
          icon={DollarSign}
          iconTone="emerald"
          variant="brand"
        />
        <KPICard
          label="EBITDA"
          value={
            <span title={fmtCLP(kpis.ebitda.value)}>{fmtCLPShort(kpis.ebitda.value)}</span>
          }
          hint={`Margen ${kpis.ebitda.marginPct}%`}
          trend={kpis.ebitda.deltaPct}
          icon={Sparkles}
          iconTone="sky"
          variant={kpis.ebitda.value >= 0 ? "ok" : "danger"}
        />
        <KPICard
          label="DSO"
          value={`${kpis.dso.value} días`}
          hint="Days Sales Outstanding"
          icon={Wallet}
          iconTone="amber"
          variant={kpis.dso.value <= 60 ? "ok" : kpis.dso.value <= 90 ? "warn" : "danger"}
        />
        <KPICard
          label="Cuentas por cobrar"
          value={
            <span title={fmtCLP(kpis.accountsReceivable.value)}>
              {fmtCLPShort(kpis.accountsReceivable.value)}
            </span>
          }
          hint={`${kpis.accountsReceivable.activeInvoices} facturas abiertas`}
          icon={Receipt}
          iconTone="violet"
        />
      </KPIGrid>

      <Surface padding="lg" elevation={1}>
        <SectionHeader
          eyebrow="CLP"
          title="Ingresos vs gastos · 12 meses"
          hint="Tendencia mensual con DTEs aceptados y journal posted."
        />
        <div className={`h-56 md:h-72 -ml-2 ${isPending ? "opacity-60" : ""}`}>
          <ResponsiveContainer>
            <AreaChart data={kpis.trendMonthly}>
              <defs>
                <linearGradient id="gV" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--ds-ok-fg))" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="hsl(var(--ds-ok-fg))" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gC" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--ds-danger-fg))" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="hsl(var(--ds-danger-fg))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="2 4"
                stroke="hsl(var(--ds-border-subtle))"
                vertical={false}
              />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11, fill: "hsl(var(--ds-text-3))" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "hsl(var(--ds-text-3))" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => fmtCLPShort(Number(v))}
                width={50}
              />
              <RTooltip
                contentStyle={{
                  background: "hsl(var(--ds-surface-2))",
                  border: "1px solid hsl(var(--ds-border-default))",
                  borderRadius: 10,
                  fontSize: 12,
                }}
                formatter={(v) => fmtCLP(Number(v))}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="hsl(var(--ds-ok-fg))"
                strokeWidth={2}
                fill="url(#gV)"
                name="Ingresos"
              />
              <Area
                type="monotone"
                dataKey="expense"
                stroke="hsl(var(--ds-danger-fg))"
                strokeWidth={2}
                fill="url(#gC)"
                name="Gastos"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Surface>

      <div className="grid lg:grid-cols-2 gap-4">
        <Surface padding="lg" elevation={1}>
          <SectionHeader title="Top 5 clientes" size="sm" />
          {kpis.topClients.length === 0 ? (
            <p className="text-sm text-ds-text-3 mt-3">Sin datos para este período.</p>
          ) : (
            <div className="space-y-2.5 mt-3">
              {kpis.topClients.map((c, i) => (
                <div key={c.id}>
                  <div className="flex items-center justify-between text-[12.5px] mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-mono font-bold shrink-0"
                        style={{ background: `${c.color}20`, color: c.color }}
                      >
                        {i + 1}
                      </span>
                      <span className="truncate text-ds-text-1">{c.name}</span>
                    </div>
                    <span className="ds-num text-ds-text-2 shrink-0">
                      {fmtCLPShort(c.total)}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden bg-ds-surface-3">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${c.pct}%`, background: c.color }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Surface>

        <Surface padding="lg" elevation={1}>
          <SectionHeader title="Concentración de ingresos" size="sm" />
          <div className="flex items-center gap-4 mt-3">
            <div className="w-32 h-32 shrink-0">
              {kpis.topClients.length > 0 ? (
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={kpis.topClients}
                      dataKey="total"
                      innerRadius={32}
                      outerRadius={56}
                      strokeWidth={0}
                    >
                      {kpis.topClients.map((c) => (
                        <Cell key={c.id} fill={c.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="w-full h-full rounded-full border border-dashed flex items-center justify-center text-[10px] text-ds-text-4 border-ds-border-default">
                  Sin datos
                </div>
              )}
            </div>
            <div className="space-y-2 flex-1 text-[12px]">
              <div className="flex justify-between">
                <span className="text-ds-text-3">Top 5</span>
                <span className="ds-num text-status-ok-fg">
                  {kpis.topClientsConcentration.pct}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-ds-text-3">HHI</span>
                <span className="ds-num text-status-warn-fg">
                  {kpis.topClientsConcentration.hhi}
                </span>
              </div>
              <p className="pt-1 text-[11px] text-ds-text-4">
                Diversificación de cartera; un HHI &gt; 0.25 indica alta concentración.
              </p>
            </div>
          </div>
        </Surface>
      </div>

      <KPIGrid>
        <KPICard
          label="Utilidad neta"
          value={
            <span title={fmtCLP(kpis.netIncome.value)}>{fmtCLPShort(kpis.netIncome.value)}</span>
          }
          hint={`Margen ${kpis.netIncome.marginPct}%`}
          trend={kpis.netIncome.deltaPct}
          icon={TrendingUp}
          iconTone="emerald"
          variant={kpis.netIncome.value >= 0 ? "ok" : "danger"}
        />
        <KPICard
          label="Cuentas por pagar"
          value={
            <span title={fmtCLP(kpis.accountsPayable.value)}>
              {fmtCLPShort(kpis.accountsPayable.value)}
            </span>
          }
          hint={`${kpis.accountsPayable.activeInvoices} facturas abiertas`}
          icon={Receipt}
          iconTone="rose"
        />
      </KPIGrid>
    </div>
  );
}
