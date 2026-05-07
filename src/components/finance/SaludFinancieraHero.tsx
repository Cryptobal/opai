"use client";

/**
 * SaludFinancieraHero — panel "salud financiera del mes" arriba del
 * KPIRow del módulo Facturación. Es lo PRIMERO que ve un dueño/CEO al
 * entrar: facturado, cobrado, por cobrar, aging, margen, IVA neto y
 * un mini-chart de cobrado vs facturado de los últimos 6 meses.
 *
 * Diseño:
 * - Surface elevation 2 con padding cómodo en desktop, compacto en
 *   mobile (mismo patrón que Inventario migrado).
 * - 4 stats principales en grilla (1 col mobile, 2 cols sm, 4 cols lg).
 * - Aging breakdown: 3 barras visuales (0-30 / 31-60 / 60+) con
 *   StatusDot por color (info/warn/danger) y conteo + monto.
 * - Mini-chart 6 meses (Recharts AreaChart, idéntico al TrendChart
 *   del KPIRow pero con cobrado en lugar de compras).
 * - Banner alerta vencidas si hay X > 0.
 *
 * Source of truth: GET /api/finance/billing/cobranzas-summary (período
 * sincronizado con el filtro global) y GET /cobranzas-trend (6 meses
 * fijos, no cambia con el filtro porque es contexto histórico).
 */

import { useEffect, useState } from "react";
import {
  TrendingUp,
  Banknote,
  Hourglass,
  AlertCircle,
  PieChart,
  Receipt,
  ArrowDownToLine,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface AgingBucket {
  bucket: "0-30" | "31-60" | "60+";
  count: number;
  monto: number;
}

interface CobranzasSummary {
  facturadoNeto: number;
  cobrado: number;
  porCobrar: number;
  agingBuckets: AgingBucket[];
  vencidasCount: number;
  vencidasMonto: number;
  margenBruto: number;
  ivaNeto: number;
  comprasNetas: number;
  ivaDebito: number;
  ivaCredito: number;
  cobradoPct: number;
  periodLabel: string;
}

interface TrendPoint {
  mes: string;
  facturado: number;
  cobrado: number;
}

const fmtCLP = (n: number) =>
  "$" + new Intl.NumberFormat("es-CL").format(Math.round(n));

const fmtCLPShort = (n: number): string => {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000_000) {
    return `${sign}$${(abs / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}MM`;
  }
  if (abs >= 1_000_000) {
    return `${sign}$${(abs / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (abs >= 1_000) {
    return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  }
  return `${sign}$${abs}`;
};

interface Props {
  /** Filtro de período del módulo (sincronizado con KPIRow). */
  periodo: string;
  /** Si true, click en "Vencidas" filtra la tabla (delegado al padre). */
  onClickVencidas?: () => void;
}

const STAT_TILE = "rounded-md border border-ds-border-subtle bg-ds-surface-2 p-3 min-w-0";
const STAT_LABEL =
  "text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-3 mb-1 flex items-center gap-1.5";

export function SaludFinancieraHero({ periodo, onClickVencidas }: Props) {
  const [summary, setSummary] = useState<CobranzasSummary | null>(null);
  const [trend, setTrend] = useState<TrendPoint[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    const params = new URLSearchParams();
    params.set("periodo", periodo);
    Promise.all([
      fetch(`/api/finance/billing/cobranzas-summary?${params.toString()}`, {
        signal: ctrl.signal,
      }).then((r) => r.json()),
      fetch("/api/finance/billing/cobranzas-trend?months=6", {
        signal: ctrl.signal,
      }).then((r) => r.json()),
    ])
      .then(([summaryJson, trendJson]) => {
        if (summaryJson?.success) setSummary(summaryJson.data);
        if (trendJson?.success) setTrend(trendJson.data);
      })
      .catch((err) => {
        if ((err as Error).name !== "AbortError") {
          console.error("[SaludFinancieraHero] fetch error:", err);
        }
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [periodo]);

  if (loading && !summary) {
    return (
      <Card className="p-4 animate-pulse">
        <div className="h-5 w-48 bg-ds-surface-2 rounded mb-3" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 bg-ds-surface-2 rounded" />
          ))}
        </div>
        <div className="h-32 bg-ds-surface-2 rounded" />
      </Card>
    );
  }

  if (!summary) return null;

  const period = summary.periodLabel ?? "Mes en curso";
  const cobradoColor = summary.cobradoPct >= 90 ? "ok" : summary.cobradoPct >= 60 ? "warn" : "danger";
  // Aging totales para barras: usado para calcular % visual.
  const agingTotal = summary.agingBuckets.reduce((acc, b) => acc + b.monto, 0);
  const bucketColors: Record<string, string> = {
    "0-30": "bg-status-ok-fg",
    "31-60": "bg-status-warn-fg",
    "60+": "bg-status-danger-fg",
  };
  const bucketTextColor: Record<string, string> = {
    "0-30": "text-status-ok-fg",
    "31-60": "text-status-warn-fg",
    "60+": "text-status-danger-fg",
  };

  // Recharts colors via CSS vars (light/dark friendly)
  const facturadoColor = "hsl(var(--ds-info-fg))";
  const cobradoChartColor = "hsl(var(--ds-ok-fg))";
  const axisColor = "hsl(var(--ds-text-3))";
  const gridColor = "hsl(var(--ds-border-subtle))";
  const tooltipBg = "hsl(var(--ds-surface-2))";
  const tooltipBorder = "hsl(var(--ds-border-default))";
  const tooltipFg = "hsl(var(--ds-text-1))";

  return (
    <Card className="p-4 sm:p-5 space-y-4 min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2 min-w-0">
        <div>
          <h2 className="font-display text-base sm:text-lg font-semibold text-ds-text-1">
            Salud financiera
          </h2>
          <p className="text-[12px] text-ds-text-3">
            {period} · Facturado neto vs cobranza · Aging y margen
          </p>
        </div>
        {summary.vencidasCount > 0 && (
          <button
            type="button"
            onClick={onClickVencidas}
            className="inline-flex items-center gap-1.5 rounded-md border border-status-danger-border bg-status-danger-soft px-2.5 py-1.5 text-[12px] font-medium text-status-danger-fg hover:opacity-90 transition-opacity"
            title="Filtrar tabla por DTEs vencidos"
          >
            <AlertCircle className="h-3.5 w-3.5" />
            {summary.vencidasCount} vencida
            {summary.vencidasCount === 1 ? "" : "s"} · {fmtCLPShort(summary.vencidasMonto)}
          </button>
        )}
      </div>

      {/* Stats principales */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 min-w-0">
        <div className={STAT_TILE}>
          <div className={STAT_LABEL}>
            <Receipt className="h-3 w-3 shrink-0" />
            <span className="truncate">Facturado neto</span>
          </div>
          <KpiAmount value={summary.facturadoNeto} />
        </div>
        <div className={STAT_TILE}>
          <div className={STAT_LABEL}>
            <ArrowDownToLine className="h-3 w-3 shrink-0" />
            <span className="truncate">Cobrado</span>
          </div>
          <KpiAmount value={summary.cobrado} />
          <div
            className={`text-[12px] mt-1 truncate ${
              cobradoColor === "ok"
                ? "text-status-ok-fg"
                : cobradoColor === "warn"
                  ? "text-status-warn-fg"
                  : "text-status-danger-fg"
            }`}
          >
            {summary.cobradoPct.toFixed(0)}% del facturado
          </div>
        </div>
        <div className={STAT_TILE}>
          <div className={STAT_LABEL}>
            <Hourglass className="h-3 w-3 shrink-0" />
            <span className="truncate">Por cobrar</span>
          </div>
          <KpiAmount value={summary.porCobrar} />
          <div className="text-[12px] text-ds-text-3 mt-1 truncate">
            {summary.agingBuckets.reduce((a, b) => a + b.count, 0)} factura
            {summary.agingBuckets.reduce((a, b) => a + b.count, 0) === 1 ? "" : "s"}
          </div>
        </div>
        <div className={STAT_TILE}>
          <div className={STAT_LABEL}>
            <TrendingUp className="h-3 w-3 shrink-0" />
            <span className="truncate">Margen bruto</span>
          </div>
          <KpiAmount value={summary.margenBruto} />
          <div className="text-[12px] text-ds-text-3 mt-1 truncate">
            Compras: {fmtCLPShort(summary.comprasNetas)}
          </div>
        </div>
      </div>

      {/* Aging breakdown + IVA */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 min-w-0">
        <div className="lg:col-span-2 rounded-md border border-ds-border-subtle bg-ds-surface-2 p-3 min-w-0">
          <div className={STAT_LABEL}>
            <Hourglass className="h-3 w-3 shrink-0" />
            <span className="truncate">Aging del por cobrar</span>
          </div>
          {agingTotal === 0 ? (
            <p className="text-[13px] text-ds-text-3 italic">
              Sin facturas pendientes en este período.
            </p>
          ) : (
            <div className="space-y-1.5">
              {summary.agingBuckets.map((b) => {
                const pct = agingTotal > 0 ? (b.monto / agingTotal) * 100 : 0;
                const label =
                  b.bucket === "0-30"
                    ? "0–30 días"
                    : b.bucket === "31-60"
                      ? "31–60 días"
                      : "Más de 60 días";
                return (
                  <div key={b.bucket} className="flex items-center gap-2 min-w-0">
                    <div
                      className={`shrink-0 w-2 h-2 rounded-full ${bucketColors[b.bucket]}`}
                    />
                    <div className="text-[12px] text-ds-text-2 w-28 shrink-0">
                      {label}
                    </div>
                    <div className="flex-1 h-2 rounded-full bg-ds-surface-3 overflow-hidden">
                      <div
                        className={`h-full ${bucketColors[b.bucket]}`}
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                    <div
                      className={`text-[12px] font-mono shrink-0 w-24 text-right ${bucketTextColor[b.bucket]}`}
                      title={fmtCLP(b.monto)}
                    >
                      {fmtCLPShort(b.monto)}
                    </div>
                    <div className="text-[11px] text-ds-text-3 font-mono shrink-0 w-10 text-right">
                      {b.count}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="rounded-md border border-ds-border-subtle bg-ds-surface-2 p-3 min-w-0">
          <div className={STAT_LABEL}>
            <PieChart className="h-3 w-3 shrink-0" />
            <span className="truncate">IVA neto del período</span>
          </div>
          <KpiAmount value={summary.ivaNeto} />
          <div className="text-[12px] text-ds-text-3 mt-1 space-y-0.5">
            <div className="flex justify-between gap-2">
              <span>Débito:</span>
              <span className="font-mono">{fmtCLPShort(summary.ivaDebito)}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span>Crédito:</span>
              <span className="font-mono">{fmtCLPShort(summary.ivaCredito)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Mini-chart 6 meses */}
      {trend && trend.length > 0 && (
        <div className="rounded-md border border-ds-border-subtle bg-ds-surface-2 p-3">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-2 min-w-0">
            <div className={STAT_LABEL}>
              <Banknote className="h-3 w-3 shrink-0" />
              <span className="truncate">Tendencia cobro vs facturación</span>
            </div>
            <div className="flex items-center gap-3 text-[11px]">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-status-info-fg" />
                <span className="text-ds-text-3">Facturado</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-status-ok-fg" />
                <span className="text-ds-text-3">Cobrado</span>
              </div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart
              data={trend}
              margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="cobranzasFactG" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={facturadoColor} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={facturadoColor} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="cobranzasCobG" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={cobradoChartColor} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={cobradoChartColor} stopOpacity={0} />
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
                width={48}
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
                formatter={(v) => fmtCLP(Number(v))}
                labelStyle={{ color: tooltipFg }}
              />
              <Area
                type="monotone"
                dataKey="facturado"
                stroke={facturadoColor}
                fill="url(#cobranzasFactG)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="cobrado"
                stroke={cobradoChartColor}
                fill="url(#cobranzasCobG)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

/**
 * Número grande con formato compacto en mobile y completo en desktop.
 * Mismo patrón que KpiAmount del KPIRow del módulo.
 */
function KpiAmount({ value }: { value: number }) {
  const exact = fmtCLP(value);
  const compact = fmtCLPShort(value);
  return (
    <div className="flex items-baseline gap-1.5 min-w-0" title={exact}>
      <span className="font-display text-xl sm:text-2xl font-bold tracking-tight text-ds-text-1 ds-num whitespace-nowrap sm:hidden">
        {compact}
      </span>
      <span className="font-display text-xl sm:text-2xl font-bold tracking-tight text-ds-text-1 ds-num whitespace-nowrap hidden sm:inline">
        {exact}
      </span>
    </div>
  );
}

