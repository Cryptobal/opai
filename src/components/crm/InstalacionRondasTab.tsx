"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, ChevronDown, ChevronRight } from "lucide-react";

interface Marcacion {
  id: string;
  checkpointName: string;
  timestamp: string;
  status: string;
  hasPhoto: boolean;
  distanceM: number | null;
}

interface Ejecucion {
  id: string;
  scheduledAt: string;
  startedAt: string | null;
  completedAt: string | null;
  guardia: string;
  template: string;
  status: string;
  checkpointsTotal: number;
  checkpointsCompletados: number;
  porcentajeCompletado: number;
  trustScore: number | null;
  durationMinutes: number | null;
  marcaciones: Marcacion[];
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  completada: { label: "Completada", color: "bg-emerald-500/20 text-emerald-400" },
  incompleta: { label: "Incompleta", color: "bg-yellow-500/20 text-yellow-400" },
  en_curso: { label: "En curso", color: "bg-blue-500/20 text-blue-400" },
  no_realizada: { label: "No realizada", color: "bg-red-500/20 text-red-400" },
  pendiente: { label: "Pendiente", color: "bg-gray-500/20 text-gray-400" },
};

function trustBadge(score: number | null) {
  if (score == null || score === 0) return { color: "bg-gray-100 text-gray-600", label: "-" };
  if (score >= 80) return { color: "bg-emerald-100 text-emerald-700", label: `${score}%` };
  if (score >= 60) return { color: "bg-yellow-100 text-yellow-700", label: `${score}%` };
  return { color: "bg-red-100 text-red-700", label: `${score}%` };
}

export function InstalacionRondasTab({ installationId }: { installationId: string }) {
  const [rows, setRows] = useState<Ejecucion[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ installationId, from: dateFrom, to: dateTo });
      if (statusFilter !== "all") params.set("status", statusFilter);
      const res = await fetch(`/api/ops/rondas/reportes?${params}`);
      const json = await res.json();
      if (json.success) setRows(json.data);
    } catch { /* ignore */ }
    setLoading(false);
  }, [installationId, dateFrom, dateTo, statusFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const kpis = useMemo(() => {
    const completed = rows.filter((r) => r.status === "completada").length;
    const total = rows.length;
    const cumplimiento = total > 0 ? Math.round((completed / total) * 100) : 0;
    const scores = rows.filter((r) => r.trustScore != null && r.trustScore > 0).map((r) => r.trustScore as number);
    const avgTrust = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    const today = new Date().toISOString().slice(0, 10);
    const todayRows = rows.filter((r) => r.scheduledAt.slice(0, 10) === today);
    const todayCompleted = todayRows.filter((r) => r.status === "completada").length;
    return { cumplimiento, avgTrust, todayCompleted, todayTotal: todayRows.length, completed, total };
  }, [rows]);

  const paginated = useMemo(() => rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [rows, page]);
  const totalPages = Math.ceil(rows.length / PAGE_SIZE);

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard label="Cumplimiento" value={`${kpis.cumplimiento}%`} sub={`${kpis.completed}/${kpis.total}`} />
        <KpiCard label="Trust Score" value={`${kpis.avgTrust}%`} />
        <KpiCard label="Hoy" value={`${kpis.todayCompleted}/${kpis.todayTotal}`} />
        <KpiCard label="Total periodo" value={`${kpis.total}`} />
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Desde</label>
          <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(0); }}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Hasta</label>
          <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(0); }}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Estado</label>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm">
            <option value="all">Todos</option>
            <option value="completada">Completada</option>
            <option value="incompleta">Incompleta</option>
            <option value="no_realizada">No realizada</option>
            <option value="en_curso">En curso</option>
          </select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left font-medium w-8"></th>
              <th className="px-3 py-2 text-left font-medium">Fecha</th>
              <th className="px-3 py-2 text-left font-medium">Guardia</th>
              <th className="px-3 py-2 text-left font-medium">Trust</th>
              <th className="px-3 py-2 text-left font-medium">Checkpoints</th>
              <th className="px-3 py-2 text-left font-medium">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {paginated.map((row) => {
              const isExpanded = expandedId === row.id;
              const statusInfo = STATUS_LABELS[row.status] ?? { label: row.status, color: "bg-gray-100 text-gray-600" };
              const trust = trustBadge(row.trustScore);
              return (
                <Fragment key={row.id}>
                  <tr className="hover:bg-muted/30 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : row.id)}>
                    <td className="px-3 py-2">
                      {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {new Date(row.scheduledAt).toLocaleDateString("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="px-3 py-2">{row.guardia || "-"}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${trust.color}`}>{trust.label}</span>
                    </td>
                    <td className="px-3 py-2">{row.checkpointsCompletados}/{row.checkpointsTotal}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusInfo.color}`}>{statusInfo.label}</span>
                    </td>
                  </tr>
                  {isExpanded && row.marcaciones.length > 0 && (
                    <tr>
                      <td colSpan={6} className="bg-muted/20 px-6 py-3">
                        <div className="space-y-1">
                          {row.marcaciones.map((m) => (
                            <div key={m.id} className="flex items-center gap-3 text-xs text-muted-foreground">
                              <span className="w-16">{new Date(m.timestamp).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}</span>
                              <span className="flex-1">{m.checkpointName}</span>
                              {m.distanceM != null && <span>{Math.round(m.distanceM)}m</span>}
                              {m.hasPhoto && <span className="text-blue-400">Foto</span>}
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {paginated.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">Sin rondas en este periodo</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{rows.length} rondas</span>
          <div className="flex gap-2">
            <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
              className="rounded border border-border px-3 py-1 text-xs disabled:opacity-50">Anterior</button>
            <span className="px-2 py-1 text-xs text-muted-foreground">{page + 1}/{totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
              className="rounded border border-border px-3 py-1 text-xs disabled:opacity-50">Siguiente</button>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}{sub && <span className="ml-1 text-muted-foreground/60">{sub}</span>}</p>
    </div>
  );
}
