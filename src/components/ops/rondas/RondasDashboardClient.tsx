"use client";

import { useMemo, useState } from "react";
import { TrustScoreGauge } from "./TrustScoreGauge";
import { StatusBadge, normalizeStatus } from "./StatusBadge";
import { FilterPills } from "./FilterPills";
import { DataTable } from "@/components/opai";
import { formatPersonName } from "@/lib/personas";
import type { DataTableColumn } from "@/components/opai";
import { Activity } from "lucide-react";
import { cn } from "@/lib/utils";

interface Row {
  id: string;
  status: string;
  checkpointsTotal: number;
  checkpointsCompletados: number;
  trustScore: number;
  scheduledAt: string;
  rondaTemplate: { name: string; installation: { name: string } };
  guardia: { persona: { firstName: string; lastName: string } } | null;
}

interface Stats {
  total: number;
  completadas: number;
  enCurso: number;
  pendientes: number;
  noRealizadas: number;
  trustPromedio: number;
  atrasadas?: number;
}

const FILTER_PILLS = [
  { id: "all",        label: "Todas" },
  { id: "en_curso",   label: "En curso" },
  { id: "atrasada",   label: "Atrasadas" },
  { id: "pendiente",  label: "Pendientes" },
  { id: "completada", label: "Completadas" },
];

export function RondasDashboardClient({ rows, stats }: { rows: Row[]; stats: Stats }) {
  const [filter, setFilter] = useState("all");

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

  const atrasadas = counts["atrasada"] ?? stats.atrasadas ?? 0;

  const columns: DataTableColumn[] = [
    {
      key: "instalacion",
      label: "Instalación / Guardia",
      render: (_v: unknown, row: Row) => (
        <div>
          <p className="text-[13px] font-medium text-[#f1f5f9]">{row.rondaTemplate?.installation?.name ?? "Ronda Libre"}</p>
          <p className="text-[11px] text-[#94a3b8]">
            {row.guardia
              ? formatPersonName(row.guardia.persona.firstName, row.guardia.persona.lastName)
              : "Sin asignar"}
          </p>
        </div>
      ),
    },
    {
      key: "status",
      label: "Estado",
      render: (_v: unknown, row: Row) => <StatusBadge status={row.status} />,
    },
    {
      key: "scheduledAt",
      label: "Fecha/Hora",
      render: (_v: unknown, row: Row) => (
        <span className="text-[13px] text-[#94a3b8] tabular-nums">
          {new Date(row.scheduledAt).toLocaleString("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
        </span>
      ),
    },
    {
      key: "progreso",
      label: "Progreso",
      className: "min-w-[140px]",
      render: (_v: unknown, row: Row) => {
        const pct =
          row.checkpointsTotal > 0
            ? Math.round((row.checkpointsCompletados / row.checkpointsTotal) * 100)
            : 0;
        return (
          <div className="space-y-1">
            <div className="h-1 bg-[#1e293b] rounded-full overflow-hidden w-28">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${pct}%`,
                  background: pct >= 70 ? "#22c55e" : pct >= 40 ? "#f59e0b" : "#ef4444",
                }}
              />
            </div>
            <p className="text-[11px] text-[#64748b]">
              {row.checkpointsCompletados}/{row.checkpointsTotal}
            </p>
          </div>
        );
      },
    },
    {
      key: "trust",
      label: "Trust",
      render: (_v: unknown, row: Row) => <TrustScoreGauge score={row.trustScore} size="sm" />,
    },
  ];

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiTile label="En curso"     value={stats.enCurso}    color="#3b82f6" />
        <KpiTile label="Completadas"  value={stats.completadas} color="#22c55e" />
        <KpiTile label="Atrasadas"    value={atrasadas}         color="#ef4444" highlight={atrasadas > 0} />
        <KpiTile label="Pendientes"   value={stats.pendientes}  color="#f59e0b" />
      </div>

      {/* Trust Score Hero */}
      <div className="rounded-xl border border-[#1e293b] bg-[#111827] p-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="flex-1">
            <p className="text-[11px] uppercase tracking-widest font-semibold text-[#64748b] mb-1">
              Trust Score promedio
            </p>
            <p className="text-[13px] text-[#94a3b8] leading-relaxed">
              Indicador consolidado de calidad de rondas basado en checkpoints, tiempo, velocidad, secuencia y puntualidad.
            </p>
            <div className="flex flex-wrap gap-4 mt-3">
              {[
                { label: "Checkpoints", pct: 30, color: "#22c55e" },
                { label: "Tiempo",      pct: 20, color: "#3b82f6" },
                { label: "Velocidad",   pct: 20, color: "#a855f7" },
                { label: "Secuencia",   pct: 15, color: "#f59e0b" },
                { label: "Puntualidad", pct: 15, color: "#2dd4bf" },
              ].map((f) => (
                <div key={f.label} className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: f.color }} />
                  <span className="text-[11px] text-[#94a3b8]">
                    {f.label} {f.pct}%
                  </span>
                </div>
              ))}
            </div>
          </div>
          <TrustScoreGauge score={stats.trustPromedio} size="lg" showLabel />
        </div>
      </div>

      {/* Table with filters */}
      <div className="rounded-xl border border-[#1e293b] bg-[#111827] overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-[#1e293b]">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#2dd4bf]" />
            <span className="text-[13px] font-semibold text-[#f1f5f9]">Ejecuciones</span>
            <span className="text-[11px] text-[#64748b] border border-[#1e293b] rounded-full px-2 py-0.5">
              Hoy
            </span>
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

function KpiTile({
  label,
  value,
  color,
  highlight,
}: {
  label: string;
  value: number;
  color: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-[#111827] p-4 relative overflow-hidden",
        highlight && "ring-1 ring-red-500/20"
      )}
      style={{
        borderColor: `${color}20`,
        borderLeftColor: color,
        borderLeftWidth: 3,
      }}
    >
      {highlight && <div className="absolute inset-0 bg-red-500/5 pointer-events-none" />}
      <p
        className="text-[11px] uppercase tracking-wider font-semibold mb-2"
        style={{ color: `${color}99` }}
      >
        {label}
      </p>
      <p className="text-3xl font-extrabold tracking-tight" style={{ color }}>
        {value}
      </p>
    </div>
  );
}
