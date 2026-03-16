"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { AsistenciaMetrics, ClientOption } from "@/types/ops-asistencia";

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
  kpiFilter: "todos" | "cubiertos" | "ppc" | "te";
  onKpiFilterChange: (f: "todos" | "cubiertos" | "ppc" | "te") => void;
  // Installation
  selectedInstallation: string;
  onInstallationChange: (id: string) => void;
  installations: { id: string; name: string }[];
  // Desktop-only client filter
  selectedClient: string;
  onClientChange: (id: string) => void;
  clients: ClientOption[];
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
  selectedInstallation,
  onInstallationChange,
  installations,
  selectedClient,
  onClientChange,
  clients,
  isDesktop,
  onExportHE,
  loading,
  hasItems,
}: AsistenciaHeaderProps) {
  return (
    <div className="sticky top-0 z-30 bg-background pb-2 space-y-2">
      {/* Row 1: Date navigation + coverage ring (mobile) */}
      <Card>
        <CardContent className="pt-3 pb-2.5 space-y-2.5">
          <div className="flex items-center gap-2">
            {/* Date nav */}
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

            {/* Export + today shortcut — desktop */}
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

          {/* Row 2: Stat pills (mobile) or KPI grid (desktop) */}
          {hasItems && !isDesktop && (
            <div className="flex flex-wrap gap-1.5">
              <StatPill
                label="Total"
                value={metrics.total}
                color="text-foreground"
                active={kpiFilter === "todos"}
                onClick={() => onKpiFilterChange("todos")}
              />
              <StatPill
                label="OK"
                value={metrics.cubiertos}
                color="text-emerald-400"
                active={kpiFilter === "cubiertos"}
                onClick={() => onKpiFilterChange("cubiertos")}
              />
              <StatPill
                label="PPC"
                value={metrics.ppc}
                color="text-amber-400"
                active={kpiFilter === "ppc"}
                onClick={() => onKpiFilterChange("ppc")}
              />
              <StatPill
                label="TE"
                value={metrics.te}
                color="text-rose-400"
                active={kpiFilter === "te"}
                onClick={() => onKpiFilterChange("te")}
              />
            </div>
          )}

          {/* Row 3: Shift filter chips */}
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

            {/* Installation chip — mobile */}
            {!isDesktop && (
              <select
                value={selectedInstallation}
                onChange={(e) => onInstallationChange(e.target.value)}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground min-w-0 flex-1 focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="all">Todas</option>
                {installations.map((inst) => (
                  <option key={inst.id} value={inst.id}>
                    {inst.name}
                  </option>
                ))}
              </select>
            )}

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

          {/* Desktop filters: client + installation SearchableSelect */}
          {isDesktop && (
            <div className="grid gap-3 grid-cols-2 animate-in slide-in-from-top-2 duration-200">
              <div className="space-y-1">
                <Label className="text-xs">Cliente</Label>
                <SearchableSelect
                  value={selectedClient === "all" ? "" : selectedClient}
                  options={clients.map((c) => ({ id: c.id, label: c.name }))}
                  placeholder="Todos los clientes"
                  emptyText="Sin clientes"
                  onChange={(val) => onClientChange(val || "all")}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Instalación</Label>
                <SearchableSelect
                  value={selectedInstallation === "all" ? "" : selectedInstallation}
                  options={installations.map((inst) => ({ id: inst.id, label: inst.name }))}
                  placeholder="Todas"
                  emptyText="Sin instalaciones"
                  onChange={(val) => onInstallationChange(val || "all")}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Desktop KPI cards */}
      {isDesktop && hasItems && (
        <div className="grid grid-cols-5 gap-2">
          {[
            { id: "todos" as const, label: "Total", value: metrics.total, color: "text-foreground" },
            { id: "cubiertos" as const, label: "Cubiertos", value: metrics.cubiertos, color: "text-emerald-400" },
            { id: "ppc" as const, label: "PPC", value: metrics.ppc, color: "text-amber-400" },
            { id: "te" as const, label: "TE", value: metrics.te, color: "text-rose-400" },
            {
              id: "cobertura" as const,
              label: "Cobertura",
              value: `${metrics.coberturaPct}%`,
              color: metrics.coberturaPct >= 80 ? "text-emerald-400" : "text-amber-400",
            },
          ].map((s) => (
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
                if (s.id !== "cobertura") onKpiFilterChange(s.id);
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
