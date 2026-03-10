"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, ChevronDown, ChevronRight, Download, ExternalLink, MapPin, QrCode, Camera, Shield } from "lucide-react";

interface Marcacion {
  id: string;
  checkpointName: string;
  timestamp: string;
  status: string;
  hasPhoto: boolean;
  hasAudio: boolean;
  distanceM: number | null;
  lat: number | null;
  lng: number | null;
  googleMapsUrl: string | null;
  geoAccuracy: number | null;
  geoValidada: boolean | null;
  geoConfidence: string | null;
  verificationMethod: string | null;
  hashIntegridad: string | null;
}

interface Ejecucion {
  id: string;
  scheduledAt: string;
  startedAt: string | null;
  completedAt: string | null;
  guardia: string;
  guardiaId: string | null;
  template: string;
  status: string;
  checkpointsTotal: number;
  checkpointsCompletados: number;
  porcentajeCompletado: number;
  trustScore: number | null;
  durationMinutes: number | null;
  marcaciones: Marcacion[];
}

interface GuardOption {
  id: string;
  name: string;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  completada: { label: "Completada", color: "bg-emerald-500/20 text-emerald-400" },
  incompleta: { label: "Incompleta", color: "bg-yellow-500/20 text-yellow-400" },
  en_curso: { label: "En curso", color: "bg-blue-500/20 text-blue-400" },
  no_realizada: { label: "No realizada", color: "bg-red-500/20 text-red-400" },
  pendiente: { label: "Pendiente", color: "bg-gray-500/20 text-gray-400" },
  cerrada_auto: { label: "Cerrada auto", color: "bg-gray-500/20 text-gray-400" },
  cerrada_admin: { label: "Cerrada admin", color: "bg-gray-500/20 text-gray-400" },
};

function trustBadge(score: number | null) {
  if (score == null || score === 0) return { color: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400", label: "-" };
  if (score >= 80) return { color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400", label: `${score}%` };
  if (score >= 60) return { color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400", label: `${score}%` };
  return { color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", label: `${score}%` };
}

function verificationBadge(method: string | null) {
  if (!method) return null;
  if (method === "QR" || method === "BOTH") return { icon: QrCode, label: "QR", color: "text-purple-400" };
  return { icon: MapPin, label: "GPS", color: "text-emerald-400" };
}

export function InstalacionRondasTab({ installationId }: { installationId: string }) {
  const [rows, setRows] = useState<Ejecucion[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [guardFilter, setGuardFilter] = useState("all");
  const [trustFilter, setTrustFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [guardOptions, setGuardOptions] = useState<GuardOption[]>([]);
  const PAGE_SIZE = 20;

  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));

  // Fetch guard options for filter dropdown
  useEffect(() => {
    fetch(`/api/crm/installations/${installationId}/guardias`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success && Array.isArray(json.data)) {
          setGuardOptions(
            json.data.map((g: any) => ({
              id: g.id,
              name: g.persona
                ? `${g.persona.firstName} ${g.persona.lastName}`.trim()
                : g.code ?? g.id,
            })),
          );
        }
      })
      .catch(() => {});
  }, [installationId]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ installationId, from: dateFrom, to: dateTo });
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (guardFilter !== "all") params.set("guardiaId", guardFilter);
      const res = await fetch(`/api/ops/rondas/reportes?${params}`);
      const json = await res.json();
      if (json.success) setRows(Array.isArray(json.data?.rows) ? json.data.rows : []);
    } catch {
      setRows([]);
    }
    setLoading(false);
  }, [installationId, dateFrom, dateTo, statusFilter, guardFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Client-side trust filter
  const filteredRows = useMemo(() => {
    if (trustFilter === "all") return rows;
    return rows.filter((r) => {
      const s = r.trustScore ?? 0;
      if (trustFilter === "high") return s >= 80;
      if (trustFilter === "medium") return s >= 60 && s < 80;
      if (trustFilter === "low") return s < 60;
      return true;
    });
  }, [rows, trustFilter]);

  const kpis = useMemo(() => {
    const arr = filteredRows ?? [];
    const completed = arr.filter((r) => r.status === "completada").length;
    const total = arr.length;
    const cumplimiento = total > 0 ? Math.round((completed / total) * 100) : 0;
    const scores = arr.filter((r) => r.trustScore != null && r.trustScore > 0).map((r) => r.trustScore as number);
    const avgTrust = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    const today = new Date().toISOString().slice(0, 10);
    const todayRows = arr.filter((r) => r.scheduledAt?.slice(0, 10) === today);
    const todayCompleted = todayRows.filter((r) => r.status === "completada").length;
    return { cumplimiento, avgTrust, todayCompleted, todayTotal: todayRows.length, completed, total };
  }, [filteredRows]);

  const arr = filteredRows ?? [];
  const paginated = useMemo(() => arr.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [arr, page]);
  const totalPages = Math.ceil(arr.length / PAGE_SIZE);

  const handleExport = useCallback(async (format: "xlsx" | "csv") => {
    setExporting(true);
    try {
      const params = new URLSearchParams({ installationId, from: dateFrom, to: dateTo, format });
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (guardFilter !== "all") params.set("guardiaId", guardFilter);
      const res = await fetch(`/api/ops/rondas/reportes/export?${params}`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rondas-${installationId.slice(0, 8)}-${dateFrom}-${dateTo}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Silent fail — export is best-effort
    }
    setExporting(false);
  }, [installationId, dateFrom, dateTo, statusFilter, guardFilter]);

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

      {/* Filters + Export */}
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
          <label className="mb-1 block text-xs text-muted-foreground">Guardia</label>
          <select value={guardFilter} onChange={(e) => { setGuardFilter(e.target.value); setPage(0); }}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm">
            <option value="all">Todos</option>
            {guardOptions.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
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
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Trust</label>
          <select value={trustFilter} onChange={(e) => { setTrustFilter(e.target.value); setPage(0); }}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm">
            <option value="all">Todos</option>
            <option value="high">Alto (80%+)</option>
            <option value="medium">Medio (60-79%)</option>
            <option value="low">Bajo (&lt;60%)</option>
          </select>
        </div>

        <div className="ml-auto flex gap-2">
          <button
            onClick={() => handleExport("xlsx")}
            disabled={exporting || arr.length === 0}
            className="flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm transition-colors hover:bg-muted disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            Excel
          </button>
          <button
            onClick={() => handleExport("csv")}
            disabled={exporting || arr.length === 0}
            className="flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm transition-colors hover:bg-muted disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            CSV
          </button>
        </div>
      </div>

      {/* Table */}
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
                  {isExpanded && (
                    <tr>
                      <td colSpan={6} className="bg-muted/20 px-4 py-3">
                        {/* Ronda summary */}
                        <div className="mb-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
                          {row.startedAt && (
                            <span>Inicio: {new Date(row.startedAt).toLocaleString("es-CL", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })}</span>
                          )}
                          {row.completedAt && (
                            <span>Fin: {new Date(row.completedAt).toLocaleString("es-CL", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })}</span>
                          )}
                          {row.durationMinutes != null && <span>Duracion: {row.durationMinutes} min</span>}
                          <span>Plantilla: {row.template}</span>
                        </div>

                        {/* Marcaciones detail */}
                        {(row.marcaciones ?? []).length > 0 ? (
                          <div className="space-y-2">
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Marcaciones</p>
                            {(row.marcaciones ?? []).map((m) => {
                              const vBadge = verificationBadge(m.verificationMethod);
                              return (
                                <div key={m.id} className="rounded-md border border-border/50 bg-background/50 px-3 py-2">
                                  <div className="flex items-center gap-3 text-xs">
                                    <span className="w-14 font-mono text-muted-foreground">
                                      {new Date(m.timestamp).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                                    </span>
                                    <span className="flex-1 font-medium">{m.checkpointName}</span>
                                    {vBadge && (
                                      <span className={`flex items-center gap-1 ${vBadge.color}`}>
                                        <vBadge.icon className="h-3 w-3" />
                                        {vBadge.label}
                                      </span>
                                    )}
                                    {m.distanceM != null && (
                                      <span className={m.geoValidada ? "text-emerald-500" : "text-red-400"}>
                                        {Math.round(m.distanceM)}m
                                      </span>
                                    )}
                                    {m.hasPhoto && <Camera className="h-3 w-3 text-blue-400" />}
                                  </div>
                                  <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground/70">
                                    {m.lat != null && m.lng != null && (
                                      <span className="font-mono">
                                        {m.lat.toFixed(6)}, {m.lng.toFixed(6)}
                                        {m.googleMapsUrl && (
                                          <a
                                            href={m.googleMapsUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            onClick={(e) => e.stopPropagation()}
                                            className="ml-1 inline-flex items-center gap-0.5 text-blue-400 hover:text-blue-300"
                                          >
                                            <ExternalLink className="h-2.5 w-2.5" />
                                            Maps
                                          </a>
                                        )}
                                      </span>
                                    )}
                                    {m.geoAccuracy != null && (
                                      <span>Precision: {Math.round(m.geoAccuracy)}m ({m.geoConfidence ?? "?"})</span>
                                    )}
                                    {m.geoValidada != null && (
                                      <span className={m.geoValidada ? "text-emerald-500" : "text-red-400"}>
                                        <Shield className="inline h-2.5 w-2.5 mr-0.5" />
                                        {m.geoValidada ? "Geo OK" : "Fuera de rango"}
                                      </span>
                                    )}
                                    {m.hashIntegridad && (
                                      <span className="font-mono truncate max-w-[200px]" title={m.hashIntegridad}>
                                        Hash: {m.hashIntegridad.slice(0, 16)}...
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">Sin marcaciones registradas</p>
                        )}
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
          <span className="text-xs text-muted-foreground">{arr.length} rondas</span>
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
