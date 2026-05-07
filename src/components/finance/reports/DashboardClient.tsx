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
import { ReportsPeriodPicker } from "./ReportsPeriodPicker";
import { ExportMenu } from "./ExportMenu";
import { KPICard } from "./shared/KPICard";

interface Props {
  initialPeriod: FinanceReportPeriod;
  initialKpis: DashboardKpis;
}

const fmt = (n: number, compact = false): string => {
  if (compact) {
    const a = Math.abs(n);
    if (a >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (a >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
    if (a >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  }
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(n);
};

export function DashboardClient({ initialPeriod, initialKpis }: Props) {
  const [period, setPeriod] = useState(initialPeriod);
  const [kpis, setKpis] = useState(initialKpis);
  const [, startTransition] = useTransition();

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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard
          label="Ingresos"
          value={fmt(kpis.revenue.value, true)}
          delta={kpis.revenue.deltaPct}
          icon={DollarSign}
          tone="emerald"
        />
        <KPICard
          label="EBITDA"
          value={fmt(kpis.ebitda.value, true)}
          delta={kpis.ebitda.deltaPct}
          icon={Sparkles}
          tone="sky"
          sub={`margen ${kpis.ebitda.marginPct}%`}
        />
        <KPICard
          label="DSO"
          value={`${kpis.dso.value} días`}
          icon={Wallet}
          tone="amber"
        />
        <KPICard
          label="Cuentas por cobrar"
          value={fmt(kpis.accountsReceivable.value, true)}
          icon={Receipt}
          tone="violet"
          sub={`${kpis.accountsReceivable.activeInvoices} facturas`}
        />
      </div>

      <section
        className="rounded-xl border bg-ds-surface p-4 md:p-5"
        style={{ borderColor: "var(--ds-border)" }}
      >
        <header className="flex items-center justify-between mb-3">
          <h3
            className="text-[13px] font-semibold"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Ingresos vs gastos · 12 meses
          </h3>
          <span className="text-[10px] font-mono uppercase tracking-wider text-ds-text-3">
            CLP
          </span>
        </header>
        <div className="h-56 md:h-72 -ml-2">
          <ResponsiveContainer>
            <AreaChart data={kpis.trendMonthly}>
              <defs>
                <linearGradient id="gV" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gC" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#F43F5E" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#F43F5E" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="2 4"
                stroke="var(--ds-border-soft)"
                vertical={false}
              />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11, fill: "var(--ds-text-3)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "var(--ds-text-3)" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => fmt(Number(v), true)}
                width={50}
              />
              <RTooltip
                contentStyle={{
                  background: "var(--ds-surface-2)",
                  border: "1px solid var(--ds-border)",
                  borderRadius: 10,
                }}
                formatter={(v) => fmt(Number(v))}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="#3B82F6"
                strokeWidth={2}
                fill="url(#gV)"
                name="Ingresos"
              />
              <Area
                type="monotone"
                dataKey="expense"
                stroke="#F43F5E"
                strokeWidth={2}
                fill="url(#gC)"
                name="Gastos"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="grid lg:grid-cols-2 gap-4">
        <section
          className="rounded-xl border bg-ds-surface p-4 md:p-5"
          style={{ borderColor: "var(--ds-border)" }}
        >
          <h3
            className="text-[13px] font-semibold mb-3"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Top 5 clientes
          </h3>
          {kpis.topClients.length === 0 ? (
            <p className="text-[12px] text-ds-text-3">Sin datos para este período.</p>
          ) : (
            <div className="space-y-2.5">
              {kpis.topClients.map((c, i) => (
                <div key={c.id}>
                  <div className="flex items-center justify-between text-[12.5px] mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-mono font-bold"
                        style={{ background: `${c.color}20`, color: c.color }}
                      >
                        {i + 1}
                      </span>
                      <span className="truncate text-ds-text-1">{c.name}</span>
                    </div>
                    <span className="font-mono text-ds-text-2 shrink-0">
                      {fmt(c.total, true)}
                    </span>
                  </div>
                  <div
                    className="h-1.5 rounded-full overflow-hidden"
                    style={{ background: "var(--ds-bg-2)" }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${c.pct}%`, background: c.color }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section
          className="rounded-xl border bg-ds-surface p-4 md:p-5"
          style={{ borderColor: "var(--ds-border)" }}
        >
          <h3
            className="text-[13px] font-semibold mb-3"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Concentración de ingresos
          </h3>
          <div className="flex items-center gap-4">
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
                <div className="w-full h-full rounded-full border border-dashed flex items-center justify-center text-[10px] text-ds-text-4"
                  style={{ borderColor: "var(--ds-border)" }}>
                  Sin datos
                </div>
              )}
            </div>
            <div className="space-y-2 flex-1 text-[12px]">
              <div className="flex justify-between">
                <span className="text-ds-text-3">Top 5</span>
                <span className="font-mono text-emerald-500">
                  {kpis.topClientsConcentration.pct}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-ds-text-3">HHI</span>
                <span className="font-mono text-amber-500">
                  {kpis.topClientsConcentration.hhi}
                </span>
              </div>
              <p className="pt-1 text-[11px] text-ds-text-4">
                Diversificación de cartera; un HHI &gt; 0.25 indica alta
                concentración.
              </p>
            </div>
          </div>
        </section>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard
          label="Utilidad neta"
          value={fmt(kpis.netIncome.value, true)}
          delta={kpis.netIncome.deltaPct}
          icon={TrendingUp}
          tone="emerald"
          sub={`margen ${kpis.netIncome.marginPct}%`}
        />
        <KPICard
          label="Cuentas por pagar"
          value={fmt(kpis.accountsPayable.value, true)}
          icon={Receipt}
          tone="rose"
          sub={`${kpis.accountsPayable.activeInvoices} facturas`}
        />
      </div>
    </div>
  );
}
