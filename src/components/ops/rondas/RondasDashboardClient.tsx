"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { TrustScoreGauge } from "./TrustScoreGauge";
import { StatusBadge, normalizeStatus } from "./StatusBadge";
import { FilterPills } from "./FilterPills";
import { AlertDistributionChart } from "./AlertDistributionChart";
import { DataTable } from "@/components/opai-ds/DataTableLegacy";
import type { DataTableColumn } from "@/components/opai-ds/DataTableLegacy";
import { Activity, AlertTriangle, Calendar, ChevronDown, Loader2, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Types ─── */

interface DashRow {
  id: string;
  status: string;
  checkpointsTotal: number;
  checkpointsCompletados: number;
  trustScore: number;
  scheduledAt: string;
  installationName: string;
  installationId: string | null;
  guardiaName: string | null;
  templateName: string;
}

interface DashStats {
  total: number;
  completadas: number;
  enCurso: number;
  pendientes: number;
  noRealizadas: number;
  atrasadas: number;
  trustPromedio: number;
  alertasActivas: number;
}

interface InstRank {
  id: string;
  name: string;
  completed: number;
  total: number;
  compliance: number;
  trustAvg: number | null;
  alerts: number;
}

interface DailyBreakdown {
  date: string;
  completed: number;
  total: number;
}

interface DashboardData {
  rows: DashRow[];
  stats: DashStats;
  alertsByType: Record<string, number>;
  installationRanking: InstRank[];
  dailyBreakdown: DailyBreakdown[];
}

/* ─── Period presets ─── */

type PeriodKey = "hoy" | "ayer" | "7d" | "30d" | "custom";

function getPeriodDates(key: PeriodKey): { from: string; to: string } {
  const now = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  switch (key) {
    case "hoy":
      return { from: fmt(now), to: fmt(now) };
    case "ayer": {
      const y = new Date(now); y.setDate(y.getDate() - 1);
      return { from: fmt(y), to: fmt(y) };
    }
    case "7d": {
      const s = new Date(now); s.setDate(s.getDate() - 6);
      return { from: fmt(s), to: fmt(now) };
    }
    case "30d": {
      const s = new Date(now); s.setDate(s.getDate() - 29);
      return { from: fmt(s), to: fmt(now) };
    }
    default:
      return { from: fmt(now), to: fmt(now) };
  }
}

const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: "hoy", label: "Hoy" },
  { key: "ayer", label: "Ayer" },
  { key: "7d", label: "7 dias" },
  { key: "30d", label: "30 dias" },
];

const FILTER_PILLS = [
  { id: "all", label: "Todas" },
  { id: "en_curso", label: "En curso" },
  { id: "atrasada", label: "Atrasadas" },
  { id: "pendiente", label: "Pendientes" },
  { id: "completada", label: "Completadas" },
];

/* ─── Main Component ─── */

export function RondasDashboardClient({ initialData }: { initialData?: DashboardData }) {
  const [period, setPeriod] = useState<PeriodKey>("7d");
  const [data, setData] = useState<DashboardData | null>(initialData ?? null);
  const [loading, setLoading] = useState(!initialData);
  const [filter, setFilter] = useState("all");

  const fetchData = useCallback(async (p: PeriodKey) => {
    setLoading(true);
    try {
      const { from, to } = getPeriodDates(p);
      const res = await fetch(`/api/ops/rondas/dashboard?from=${from}&to=${to}`);
      const json = await res.json();
      if (json.success) setData(json.data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchData(period);
  }, [period, fetchData]);

  const rows = data?.rows ?? [];
  const stats = data?.stats ?? { total: 0, completadas: 0, enCurso: 0, pendientes: 0, noRealizadas: 0, atrasadas: 0, trustPromedio: 0, alertasActivas: 0 };

  const filtered = useMemo(() => {
    if (filter === "all") return rows;
    return rows.filter((r) => normalizeStatus(r.status) === filter);
  }, [rows, filter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    rows.forEach((r) => {
      const s = normalizeStatus(r.status);
      c[s] = (c[s] ?? 0) + 1;
    });
    return c;
  }, [rows]);

  const pillsWithCounts = FILTER_PILLS.map((p) => ({
    ...p,
    count: p.id !== "all" ? (counts[p.id] ?? 0) : undefined,
  }));

  const columns: DataTableColumn[] = [
    {
      key: "templateName",
      label: "Ronda",
      render: (_v: unknown, row: DashRow) => (
        <span className="text-[11px] text-[#94a3b8]">{row.templateName}</span>
      ),
    },
    {
      key: "instalacion",
      label: "Instalacion / Guardia",
      render: (_v: unknown, row: DashRow) => (
        <div>
          <p className="text-[12px] font-medium text-[#f1f5f9]">{row.installationName}</p>
          <p className="text-[10px] text-[#94a3b8]">{row.guardiaName ?? "Sin asignar"}</p>
        </div>
      ),
    },
    {
      key: "status",
      label: "Estado",
      render: (_v: unknown, row: DashRow) => <StatusBadge status={row.status} />,
    },
    {
      key: "scheduledAt",
      label: "Hora",
      render: (_v: unknown, row: DashRow) => (
        <span className="text-[12px] text-[#94a3b8] tabular-nums">
          {new Date(row.scheduledAt).toLocaleString("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
        </span>
      ),
    },
    {
      key: "progreso",
      label: "Progreso",
      className: "min-w-[120px]",
      render: (_v: unknown, row: DashRow) => {
        const pct = row.checkpointsTotal > 0 ? Math.round((row.checkpointsCompletados / row.checkpointsTotal) * 100) : 0;
        return (
          <div className="space-y-0.5">
            <div className="h-1 bg-[#1a1f2e] rounded-full overflow-hidden w-24">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${pct}%`, background: pct >= 70 ? "#22c55e" : pct >= 40 ? "#f59e0b" : "#ef4444" }}
              />
            </div>
            <p className="text-[10px] text-[#64748b] tabular-nums">{row.checkpointsCompletados}/{row.checkpointsTotal}</p>
          </div>
        );
      },
    },
    {
      key: "trust",
      label: "Trust",
      render: (_v: unknown, row: DashRow) => <TrustScoreGauge score={row.trustScore} size="sm" />,
    },
  ];

  return (
    <div className="space-y-5">
      {/* Period selector */}
      <div className="flex items-center gap-2">
        <Calendar className="h-4 w-4 text-[#64748b]" />
        <div className="flex items-center gap-1 bg-[#0a0f1c] border border-[#1a1f2e] rounded-lg p-0.5">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setPeriod(opt.key)}
              className={cn(
                "px-3 py-1.5 rounded-md text-[11px] font-semibold transition-colors",
                period === opt.key
                  ? "bg-cyan-500/15 text-cyan-400"
                  : "text-[#64748b] hover:text-[#94a3b8] hover:bg-[#111827]",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {loading && <Loader2 className="h-3.5 w-3.5 text-cyan-400 animate-spin ml-2" />}
      </div>

      {/* KPI Row — 6 cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiTile label="Completadas" value={stats.completadas} color="#22c55e" />
        <KpiTile label="En curso" value={stats.enCurso} color="#06b6d4" />
        <KpiTile label="Pendientes" value={stats.pendientes} color="#f59e0b" />
        <KpiTile label="Atrasadas" value={stats.atrasadas} color="#ef4444" highlight={stats.atrasadas > 0} />
        <KpiTile label="Trust prom." value={stats.trustPromedio} color={stats.trustPromedio >= 80 ? "#22c55e" : stats.trustPromedio >= 60 ? "#f59e0b" : "#ef4444"} />
        <KpiTile label="Alertas" value={stats.alertasActivas} color="#ef4444" highlight={stats.alertasActivas > 0} />
      </div>

      {/* Middle row: Trust Hero + Alert Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Trust Score */}
        <div className="rounded-xl border border-[#1a1f2e] bg-[#0a0f1c] p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <p className="text-[10px] uppercase tracking-widest font-semibold text-[#64748b] mb-1.5">
                Trust Score promedio
              </p>
              <div className="flex flex-wrap gap-3 mt-2">
                {[
                  { label: "Checkpoints", pct: 30, color: "#22c55e" },
                  { label: "Tiempo", pct: 20, color: "#3b82f6" },
                  { label: "Velocidad", pct: 20, color: "#a855f7" },
                  { label: "Secuencia", pct: 15, color: "#f59e0b" },
                  { label: "Puntualidad", pct: 15, color: "#2dd4bf" },
                ].map((f) => (
                  <div key={f.label} className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: f.color }} />
                    <span className="text-[10px] text-[#64748b]">{f.label} {f.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
            <TrustScoreGauge score={stats.trustPromedio} size="lg" showLabel />
          </div>
        </div>

        {/* Alert Distribution */}
        <div className="rounded-xl border border-[#1a1f2e] bg-[#0a0f1c] p-5">
          <p className="text-[10px] uppercase tracking-widest font-semibold text-[#64748b] mb-3 flex items-center gap-1.5">
            <AlertTriangle className="h-3 w-3" />
            Distribucion de alertas
          </p>
          <div className="h-[160px]">
            <AlertDistributionChart alertsByType={data?.alertsByType ?? {}} />
          </div>
        </div>
      </div>

      {/* Daily compliance heatmap (only for multi-day periods) */}
      {(data?.dailyBreakdown?.length ?? 0) > 1 && (
        <div className="rounded-xl border border-[#1a1f2e] bg-[#0a0f1c] p-5">
          <p className="text-[10px] uppercase tracking-widest font-semibold text-[#64748b] mb-3">
            Cumplimiento diario
          </p>
          <div className="flex gap-1.5 flex-wrap">
            {(data?.dailyBreakdown ?? []).map((day) => {
              const pct = day.total > 0 ? Math.round((day.completed / day.total) * 100) : 0;
              const bg = pct >= 80 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-500" : pct > 0 ? "bg-red-500" : "bg-zinc-700";
              const opacity = pct >= 80 ? "opacity-80" : pct >= 60 ? "opacity-70" : pct > 0 ? "opacity-60" : "opacity-30";
              const label = new Date(day.date + "T12:00:00").toLocaleDateString("es-CL", { weekday: "short", day: "numeric" });
              return (
                <div
                  key={day.date}
                  className="flex flex-col items-center gap-1"
                  title={`${day.date}: ${day.completed}/${day.total} (${pct}%)`}
                >
                  <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", bg, opacity)}>
                    <span className="text-[11px] font-bold text-white tabular-nums">{pct}%</span>
                  </div>
                  <span className="text-[9px] text-[#64748b] capitalize">{label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Installation Ranking */}
      {(data?.installationRanking?.length ?? 0) > 0 && (
        <div className="rounded-xl border border-[#1a1f2e] bg-[#0a0f1c] overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-[#1a1f2e]">
            <Trophy className="h-3.5 w-3.5 text-amber-400" />
            <span className="text-[12px] font-semibold text-[#f1f5f9]">Ranking por instalacion</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-[#1a1f2e] bg-[#080c16]">
                  <th className="px-4 py-2 text-left text-[10px] text-[#475569] font-semibold uppercase tracking-wider w-8">#</th>
                  <th className="px-4 py-2 text-left text-[10px] text-[#475569] font-semibold uppercase tracking-wider">Instalacion</th>
                  <th className="px-4 py-2 text-center text-[10px] text-[#475569] font-semibold uppercase tracking-wider">Cumplimiento</th>
                  <th className="px-4 py-2 text-center text-[10px] text-[#475569] font-semibold uppercase tracking-wider">Trust</th>
                  <th className="px-4 py-2 text-center text-[10px] text-[#475569] font-semibold uppercase tracking-wider">Rondas</th>
                  <th className="px-4 py-2 text-center text-[10px] text-[#475569] font-semibold uppercase tracking-wider">Alertas</th>
                </tr>
              </thead>
              <tbody>
                {(data?.installationRanking ?? []).map((inst, i) => {
                  const compColor = inst.compliance >= 80 ? "text-emerald-400" : inst.compliance >= 60 ? "text-amber-400" : "text-red-400";
                  const trustColor = inst.trustAvg != null
                    ? inst.trustAvg >= 80 ? "text-emerald-400" : inst.trustAvg >= 60 ? "text-amber-400" : "text-red-400"
                    : "text-zinc-600";
                  return (
                    <tr key={inst.id} className="border-b border-[#1a1f2e]/50 hover:bg-[#111827]/50">
                      <td className="px-4 py-2.5 text-[#64748b] tabular-nums">{i + 1}</td>
                      <td className="px-4 py-2.5 text-[#f1f5f9] font-medium">{inst.name}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={cn("font-bold tabular-nums", compColor)}>{inst.compliance}%</span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={cn("font-bold tabular-nums", trustColor)}>{inst.trustAvg ?? "\u2014"}</span>
                      </td>
                      <td className="px-4 py-2.5 text-center text-[#94a3b8] tabular-nums">
                        {inst.completed}/{inst.total}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {inst.alerts > 0 ? (
                          <span className="text-red-400 font-bold tabular-nums">{inst.alerts}</span>
                        ) : (
                          <span className="text-zinc-600">\u2014</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Executions Table */}
      <div className="rounded-xl border border-[#1a1f2e] bg-[#0a0f1c] overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-[#1a1f2e]">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-400" />
            <span className="text-[12px] font-semibold text-[#f1f5f9]">Ejecuciones</span>
            <span className="text-[10px] text-[#64748b] tabular-nums">{rows.length} total</span>
          </div>
          <FilterPills pills={pillsWithCounts} value={filter} onChange={setFilter} />
        </div>
        <DataTable
          columns={columns}
          data={filtered}
          emptyMessage="Sin rondas para este filtro."
        />
      </div>
    </div>
  );
}

/* ─── KPI Tile ─── */

function KpiTile({ label, value, color, highlight }: { label: string; value: number; color: string; highlight?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-[#0a0f1c] p-4 relative overflow-hidden",
        highlight && "ring-1 ring-red-500/20",
      )}
      style={{ borderColor: `${color}15`, borderLeftColor: color, borderLeftWidth: 3 }}
    >
      {highlight && <div className="absolute inset-0 bg-red-500/5 pointer-events-none" />}
      <p className="text-[10px] uppercase tracking-wider font-semibold mb-1.5" style={{ color: `${color}99` }}>
        {label}
      </p>
      <p className="text-2xl font-extrabold tracking-tight tabular-nums" style={{ color }}>
        {value}
      </p>
    </div>
  );
}
