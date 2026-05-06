"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import {
  TrendingUp,
  DollarSign,
  AlertCircle,
  Hash,
  PieChart as PieChartIcon,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const fmtCLP = (n: number) =>
  "$" + new Intl.NumberFormat("es-CL").format(Math.round(n));

const fmtCLPShort = (n: number) => {
  if (n >= 1_000_000) return "$" + (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return "$" + (n / 1_000).toFixed(0) + "K";
  return "$" + n;
};

interface KPIs {
  ventasMes: number;
  ivaDebitoMes: number;
  pendientesSii: number;
  facturasMes: number;
  foliosDisponibles: number;
  foliosLowCount: number;
  comparison: { vs: string; pct: number };
}

interface Trend {
  mes: string;
  ventas: number;
  compras: number;
}

const EYEBROW =
  "text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-3 mb-1 flex items-center gap-1.5";

export function KPIRow({ kpis }: { kpis: KPIs }) {
  const trendUp = kpis.comparison.pct >= 0;
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Card className="p-4 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-24 h-24 bg-status-ok-soft rounded-full -mr-8 -mt-8 opacity-60" />
        <div className="relative">
          <div className={EYEBROW}>
            <DollarSign className="h-3 w-3" />
            <span>Ventas mes</span>
          </div>
          <div className="font-display text-2xl font-bold tracking-tight text-ds-text-1 ds-num">
            {fmtCLP(kpis.ventasMes)}
          </div>
          <div className="flex items-center gap-1 mt-1.5">
            <TrendingUp
              className={
                trendUp
                  ? "h-3 w-3 text-status-ok-fg"
                  : "h-3 w-3 text-status-danger-fg rotate-180"
              }
            />
            <span
              className={
                trendUp
                  ? "text-[12px] font-medium text-status-ok-fg"
                  : "text-[12px] font-medium text-status-danger-fg"
              }
            >
              {trendUp ? "+" : ""}
              {kpis.comparison.pct.toFixed(1)}% {kpis.comparison.vs}
            </span>
          </div>
        </div>
      </Card>

      <Card className="p-4 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-24 h-24 bg-status-info-soft rounded-full -mr-8 -mt-8 opacity-60" />
        <div className="relative">
          <div className={EYEBROW}>
            <PieChartIcon className="h-3 w-3" />
            <span>IVA débito mes</span>
          </div>
          <div className="font-display text-2xl font-bold tracking-tight text-ds-text-1 ds-num">
            {fmtCLP(kpis.ivaDebitoMes)}
          </div>
          <div className="text-[12px] text-ds-text-3 mt-1.5">
            {kpis.facturasMes} factura{kpis.facturasMes === 1 ? "" : "s"} emitida{kpis.facturasMes === 1 ? "" : "s"}
          </div>
        </div>
      </Card>

      <Card className="p-4 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-24 h-24 bg-status-warn-soft rounded-full -mr-8 -mt-8 opacity-60" />
        <div className="relative">
          <div className={EYEBROW}>
            <AlertCircle className="h-3 w-3" />
            <span>Pendientes SII</span>
          </div>
          <div className="font-display text-2xl font-bold tracking-tight text-ds-text-1 ds-num">
            {kpis.pendientesSii}
          </div>
          <div
            className={
              kpis.pendientesSii > 0
                ? "text-[12px] text-status-warn-fg mt-1.5"
                : "text-[12px] text-status-ok-fg mt-1.5"
            }
          >
            {kpis.pendientesSii > 0
              ? "Esperando aceptación"
              : "Todo aceptado"}
          </div>
        </div>
      </Card>

      <Card className="p-4 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-24 h-24 bg-tint-violet rounded-full -mr-8 -mt-8 opacity-60" />
        <div className="relative">
          <div className={EYEBROW}>
            <Hash className="h-3 w-3" />
            <span>Folios disp.</span>
          </div>
          <div className="font-display text-2xl font-bold tracking-tight text-ds-text-1 ds-num">
            {kpis.foliosDisponibles}
          </div>
          <div
            className={
              kpis.foliosLowCount > 0
                ? "text-[12px] text-status-warn-fg mt-1.5"
                : "text-[12px] text-ds-text-3 mt-1.5"
            }
          >
            {kpis.foliosLowCount > 0
              ? `${kpis.foliosLowCount} con stock bajo`
              : "Stock OK"}
          </div>
        </div>
      </Card>
    </div>
  );
}

export function TrendChart() {
  const [data, setData] = useState<Trend[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/finance/billing/trend")
      .then((r) => r.json())
      .then((body) => {
        if (body.success) setData(body.data);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Card className="p-4 h-[220px] flex items-center justify-center text-ds-text-3 text-sm">
        Cargando…
      </Card>
    );
  }

  // Recharts acepta variables CSS — esto respeta light/dark sin hex hardcoded.
  const ventasColor = "hsl(var(--ds-ok-fg))";
  const comprasColor = "hsl(var(--ds-warn-fg))";
  const axisColor = "hsl(var(--ds-text-3))";
  const gridColor = "hsl(var(--ds-border-subtle))";
  const tooltipBg = "hsl(var(--ds-surface-2))";
  const tooltipBorder = "hsl(var(--ds-border-default))";
  const tooltipFg = "hsl(var(--ds-text-1))";

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <h3 className="font-display font-semibold text-sm text-ds-text-1">
            Tendencia ventas vs compras
          </h3>
          <p className="text-[12px] text-ds-text-3">Últimos 6 meses</p>
        </div>
        <div className="flex items-center gap-3 text-[12px]">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-status-ok-fg" />
            <span className="text-ds-text-2">Ventas</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-status-warn-fg" />
            <span className="text-ds-text-2">Compras</span>
          </div>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="dteVentasG" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ventasColor} stopOpacity={0.3} />
              <stop offset="100%" stopColor={ventasColor} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="dteComprasG" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={comprasColor} stopOpacity={0.3} />
              <stop offset="100%" stopColor={comprasColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="mes"
            stroke={axisColor}
            fontSize={11}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            stroke={axisColor}
            fontSize={11}
            tickLine={false}
            axisLine={false}
            tickFormatter={fmtCLPShort}
            width={50}
          />
          <CartesianGrid
            strokeDasharray="3 3"
            stroke={gridColor}
            vertical={false}
          />
          <Tooltip
            contentStyle={{
              background: tooltipBg,
              border: `1px solid ${tooltipBorder}`,
              borderRadius: "8px",
              fontSize: "12px",
              color: tooltipFg,
            }}
            formatter={(value) => fmtCLP(Number(value))}
            labelStyle={{ color: tooltipFg }}
          />
          <Area
            type="monotone"
            dataKey="ventas"
            stroke={ventasColor}
            fill="url(#dteVentasG)"
            strokeWidth={2}
          />
          <Area
            type="monotone"
            dataKey="compras"
            stroke={comprasColor}
            fill="url(#dteComprasG)"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </Card>
  );
}
