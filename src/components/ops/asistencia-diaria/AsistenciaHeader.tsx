"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import type { AsistenciaMetrics } from "@/types/ops-asistencia";
import type { KpiFilterType } from "@/hooks/useAsistenciaDiaria";

/* ── Coverage ring SVG (mobile only) ──────────────────────────────────── */

function CoverageRing({ pct }: { pct: number }) {
  const circumference = 2 * Math.PI * 18; // r=18
  const stroke =
    pct >= 80 ? "rgb(52 211 153)" : pct >= 50 ? "rgb(251 191 36)" : "rgb(248 113 113)";
  return (
    <svg width={44} height={44} viewBox="0 0 44 44" className="shrink-0">
      <circle cx={22} cy={22} r={18} fill="none" stroke="hsl(var(--border))" strokeWidth={3.5} />
      <circle
        cx={22}
        cy={22}
        r={18}
        fill="none"
        stroke={stroke}
        strokeWidth={3.5}
        strokeDasharray={`${(pct / 100) * circumference} ${circumference}`}
        strokeLinecap="round"
        transform="rotate(-90 22 22)"
      />
      <text
        x={22}
        y={22}
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-foreground text-[10px] font-bold"
      >
        {pct}%
      </text>
    </svg>
  );
}

/* ── Stat pill (mobile KPI chip) ──────────────────────────────────────── */

function StatPill({
  label,
  value,
  color,
  active,
  onClick,
}: {
  label: string;
  value: number | string;
  color: string;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
        active
          ? "bg-primary/15 ring-1 ring-primary/50"
          : "bg-muted/50 hover:bg-muted"
      }`}
    >
      <span className={`font-bold ${color}`}>{value}</span>
      <span className="text-muted-foreground">{label}</span>
    </button>
  );
}

/* ── Props ────────────────────────────────────────────────────────────── */

interface AsistenciaHeaderProps {
  // Date
  selectedDate: string;
  onDateChange: (date: string) => void;
  onNavigateDate: (dir: -1 | 1) => void;
  isToday: boolean;
  // Metrics
  metrics: AsistenciaMetrics;
  // Filters
  shiftFilter: "todos" | "dia" | "noche";
  onShiftFilterChange: (f: "todos" | "dia" | "noche") => void;
  kpiFilter: KpiFilterType;
  onKpiFilterChange: (f: KpiFilterType) => void;
  // Search
  searchQuery: string;
  onSearchChange: (q: string) => void;
  // Layout
  isDesktop: boolean;
  // Export
  onExportHE: () => void;
  loading: boolean;
  hasItems: boolean;
}

/* ── Component ────────────────────────────────────────────────────────── */

export function AsistenciaHeader({
  selectedDate,
  onDateChange,
  onNavigateDate,
  isToday,
  metrics,
  shiftFilter,
  onShiftFilterChange,
  kpiFilter,
  onKpiFilterChange,
  searchQuery,
  onSearchChange,
  isDesktop,
  onExportHE,
  loading,
  hasItems,
}: AsistenciaHeaderProps) {
  const kpiCards: { id: KpiFilterType | "cobertura"; label: string; value: number | string; color: string }[] = [
    { id: "todos", label: "Total", value: metrics.total, color: "text-foreground" },
    { id: "cubiertos", label: "Cubiertos", value: metrics.cubiertos, color: "text-emerald-400" },
    { id: "ppc", label: "PPC", value: metrics.ppc, color: "text-amber-400" },
    { id: "te", label: "TE", value: metrics.te, color: "text-rose-400" },
    { id: "fuera_rango", label: "Fuera de Rango", value: metrics.fueraDeRango, color: "text-orange-400" },
    {
      id: "cobertura",
      label: "Cobertura",
      value: `${metrics.coberturaPct}%`,
      color: metrics.coberturaPct >= 80 ? "text-emerald-400" : metrics.coberturaPct >= 50 ? "text-amber-400" : "text-red-400",
    },
  ];

  return (
    <div className="sticky top-0 z-30 bg-background pb-2 space-y-2">
      <Card>
        <CardContent className="pt-3 pb-2.5 space-y-2.5">
          {/* Row 1: Date navigation */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-md border border-input bg-transparent h-9 w-10 shrink-0 text-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                onClick={() => onNavigateDate(-1)}
                aria-label="Día anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <input
                key={selectedDate}
                type="date"
                value={selectedDate}
                onChange={(e) => onDateChange(e.target.value)}
                className="h-9 flex-1 min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-md border border-input bg-transparent h-9 w-10 shrink-0 text-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                onClick={() => onNavigateDate(1)}
                aria-label="Día siguiente"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* Coverage ring — mobile only */}
            {!isDesktop && hasItems && (
              <CoverageRing pct={metrics.coberturaPct} />
            )}

            {/* Export — desktop */}
            {isDesktop && (
              <div className="flex items-center gap-2 ml-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  disabled={loading}
                  onClick={onExportHE}
                >
                  Exportar HE día
                </Button>
              </div>
            )}
          </div>

          {/* Row 2: Stat pills (mobile) */}
          {hasItems && !isDesktop && (
            <div className="flex flex-wrap gap-1.5">
              <StatPill label="Total" value={metrics.total} color="text-foreground" active={kpiFilter === "todos"} onClick={() => onKpiFilterChange("todos")} />
              <StatPill label="OK" value={metrics.cubiertos} color="text-emerald-400" active={kpiFilter === "cubiertos"} onClick={() => onKpiFilterChange("cubiertos")} />
              <StatPill label="PPC" value={metrics.ppc} color="text-amber-400" active={kpiFilter === "ppc"} onClick={() => onKpiFilterChange("ppc")} />
              <StatPill label="TE" value={metrics.te} color="text-rose-400" active={kpiFilter === "te"} onClick={() => onKpiFilterChange("te")} />
              <StatPill label="F.Rango" value={metrics.fueraDeRango} color="text-orange-400" active={kpiFilter === "fuera_rango"} onClick={() => onKpiFilterChange("fuera_rango")} />
            </div>
          )}

          {/* Row 3: Shift filter + search */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground shrink-0">Turno:</span>
            <div className="flex rounded-md border border-input overflow-hidden">
              {(["todos", "dia", "noche"] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    shiftFilter === opt
                      ? "bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground hover:bg-muted"
                  }`}
                  onClick={() => onShiftFilterChange(opt)}
                >
                  {opt === "todos" ? "Todos" : opt === "dia" ? "Día" : "Noche"}
                </button>
              ))}
            </div>

            {/* Mobile export button */}
            {!isDesktop && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs shrink-0"
                disabled={loading}
                onClick={onExportHE}
              >
                HE
              </Button>
            )}
          </div>

          {/* Row 4: Unified search input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Buscar por cliente o instalación..."
              className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-8 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary/50"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground/50 hover:text-foreground hover:bg-accent transition-all"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Desktop KPI cards */}
      {isDesktop && hasItems && (
        <div className="grid grid-cols-6 gap-2">
          {kpiCards.map((s) => (
            <Card
              key={s.id}
              className={`transition-colors ${
                s.id === "cobertura"
                  ? ""
                  : kpiFilter === s.id
                    ? "ring-2 ring-primary/80 bg-primary/10 cursor-pointer"
                    : "cursor-pointer hover:bg-muted/50"
              }`}
              onClick={() => {
                if (s.id !== "cobertura") onKpiFilterChange(s.id as KpiFilterType);
              }}
            >
              <CardContent className="pt-2.5 pb-2.5 text-center">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{s.label}</p>
                <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
