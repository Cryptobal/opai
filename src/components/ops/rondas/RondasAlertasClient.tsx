"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertaCard } from "@/components/ops/rondas/alerta-card";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { Bot, CheckCircle2, Eye, Loader2, ShieldCheck } from "lucide-react";
import { FilterPills } from "./FilterPills";
import { ALERT_CATALOG, ALERT_TYPE_CODES } from "@/lib/rondas/alert-catalog";

interface Installation {
  id: string;
  name: string;
}

export function RondasAlertasClient({
  initialRows,
  installations,
}: {
  initialRows: any[];
  installations: Installation[];
}) {
  const [rows, setRows] = useState(initialRows);
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [tipoFilter, setTipoFilter] = useState<string>("all");
  const [installationFilter, setInstallationFilter] = useState("");
  const [stateFilter, setStateFilter] = useState<string>("no_resueltas");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<"resolve" | "acknowledge" | null>(null);

  // Alert type filter pills from catalog
  const tipoPills = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of rows) {
      if (!r.resuelta) counts[r.tipo] = (counts[r.tipo] ?? 0) + 1;
    }
    const activeTipos = ALERT_TYPE_CODES.filter((c) => counts[c]);
    return [
      { id: "all", label: "Todos", count: rows.filter((r: any) => !r.resuelta).length },
      ...activeTipos.map((c) => ({
        id: c,
        label: ALERT_CATALOG[c].label,
        count: counts[c] ?? 0,
      })),
    ];
  }, [rows]);

  const filtered = useMemo(() => {
    let result = rows;

    if (severityFilter !== "all") {
      result = result.filter((a: any) => a.severidad === severityFilter);
    }
    if (tipoFilter !== "all") {
      result = result.filter((a: any) => a.tipo === tipoFilter);
    }
    if (installationFilter) {
      result = result.filter((a: any) => a.installationId === installationFilter || a.installation?.id === installationFilter);
    }
    if (stateFilter === "no_resueltas") {
      result = result.filter((a: any) => !a.resuelta);
    } else if (stateFilter === "no_reconocidas") {
      result = result.filter((a: any) => !a.resuelta && !a.isAcknowledged);
    } else if (stateFilter === "reconocidas") {
      result = result.filter((a: any) => a.isAcknowledged && !a.resuelta);
    } else if (stateFilter === "resueltas") {
      result = result.filter((a: any) => a.resuelta);
    }
    if (dateFrom) {
      const from = new Date(dateFrom);
      result = result.filter((a: any) => new Date(a.createdAt) >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo + "T23:59:59");
      result = result.filter((a: any) => new Date(a.createdAt) <= to);
    }

    return result;
  }, [rows, severityFilter, tipoFilter, installationFilter, stateFilter, dateFrom, dateTo]);

  // Clear selection when filters change
  useMemo(() => {
    setSelectedIds(new Set());
  }, [severityFilter, tipoFilter, installationFilter, stateFilter, dateFrom, dateTo]);

  const handleAcknowledge = async (id: string) => {
    const res = await fetch(`/api/ops/rondas/alertas/${id}/acknowledge`, { method: "PUT" });
    const json = await res.json();
    if (!res.ok || !json.success) {
      toast.error(json.error ?? "Error");
      return;
    }
    setRows((prev) =>
      prev.map((a) => (a.id === id ? { ...a, isAcknowledged: true, acknowledgedAt: new Date().toISOString() } : a)),
    );
    toast.success("Alerta reconocida");
  };

  const handleResolve = async (id: string) => {
    const res = await fetch(`/api/ops/rondas/alertas/${id}/resolve`, { method: "PUT" });
    const json = await res.json();
    if (!res.ok || !json.success) {
      toast.error(json.error ?? "Error");
      return;
    }
    setRows((prev) =>
      prev.map((a) => (a.id === id ? { ...a, resuelta: true, resueltaAt: new Date().toISOString() } : a)),
    );
    toast.success("Alerta resuelta");
  };

  // Bulk actions
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    const unresolvedIds = filtered.filter((a: any) => !a.resuelta).map((a: any) => a.id);
    setSelectedIds(new Set(unresolvedIds));
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleBulkResolve = async () => {
    if (selectedIds.size === 0) return;
    setBulkAction("resolve");
    try {
      const ids = Array.from(selectedIds);
      const results = await Promise.allSettled(
        ids.map((id) => fetch(`/api/ops/rondas/alertas/${id}/resolve`, { method: "PUT" }).then((r) => r.json())),
      );
      const resolved = results.filter((r) => r.status === "fulfilled" && (r.value as any).success).length;
      setRows((prev) =>
        prev.map((a) => (selectedIds.has(a.id) ? { ...a, resuelta: true, resueltaAt: new Date().toISOString() } : a)),
      );
      setSelectedIds(new Set());
      toast.success(`${resolved} alerta${resolved !== 1 ? "s" : ""} resuelta${resolved !== 1 ? "s" : ""}`);
    } catch {
      toast.error("Error resolviendo alertas");
    } finally {
      setBulkAction(null);
    }
  };

  const handleBulkAcknowledge = async () => {
    if (selectedIds.size === 0) return;
    setBulkAction("acknowledge");
    try {
      const ids = Array.from(selectedIds);
      const results = await Promise.allSettled(
        ids.map((id) => fetch(`/api/ops/rondas/alertas/${id}/acknowledge`, { method: "PUT" }).then((r) => r.json())),
      );
      const acked = results.filter((r) => r.status === "fulfilled" && (r.value as any).success).length;
      setRows((prev) =>
        prev.map((a) =>
          selectedIds.has(a.id) ? { ...a, isAcknowledged: true, acknowledgedAt: new Date().toISOString() } : a,
        ),
      );
      setSelectedIds(new Set());
      toast.success(`${acked} alerta${acked !== 1 ? "s" : ""} reconocida${acked !== 1 ? "s" : ""}`);
    } catch {
      toast.error("Error reconociendo alertas");
    } finally {
      setBulkAction(null);
    }
  };

  return (
    <div className="space-y-4 min-w-0">
      {/* Filters */}
      <div className="space-y-2">
        {/* Row 1: Severity */}
        <div className="flex flex-wrap items-center gap-2">
          <FilterPills
            pills={[
              { id: "all",      label: "Todas" },
              { id: "critical", label: "Crítica" },
              { id: "warning",  label: "Warning" },
              { id: "info",     label: "Info" },
            ]}
            value={severityFilter}
            onChange={setSeverityFilter}
          />
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <div className="w-44">
              <SearchableSelect
                value={installationFilter}
                options={installations.map((i) => ({ id: i.id, label: i.name }))}
                placeholder="Buscar instalación..."
                onChange={setInstallationFilter}
              />
            </div>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-8 rounded-lg border border-[#1a1f2e] bg-[#111827] text-[13px] text-[#f1f5f9] px-3 w-36"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-8 rounded-lg border border-[#1a1f2e] bg-[#111827] text-[13px] text-[#f1f5f9] px-3 w-36"
            />
          </div>
        </div>

        {/* Row 2: Alert type filter */}
        <FilterPills
          pills={tipoPills}
          value={tipoFilter}
          onChange={setTipoFilter}
        />

        {/* Row 3: State */}
        <FilterPills
          pills={[
            { id: "no_resueltas",   label: "No resueltas" },
            { id: "no_reconocidas", label: "Sin reconocer" },
            { id: "reconocidas",    label: "Reconocidas" },
            { id: "resueltas",      label: "Resueltas" },
            { id: "all",            label: "Todas" },
          ]}
          value={stateFilter}
          onChange={setStateFilter}
        />
      </div>

      {/* Alert count + bulk select controls */}
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-[#94a3b8]">
          <span className="font-semibold text-[#f1f5f9]">{filtered.length}</span> alerta{filtered.length !== 1 ? "s" : ""}
          {selectedIds.size > 0 && (
            <span className="text-cyan-400 ml-2">
              · {selectedIds.size} seleccionada{selectedIds.size !== 1 ? "s" : ""}
            </span>
          )}
        </p>
        <div className="flex items-center gap-2">
          {selectedIds.size === 0 ? (
            <button
              onClick={selectAll}
              className="text-[11px] text-[#64748b] hover:text-[#f1f5f9] transition-colors"
            >
              Seleccionar todas
            </button>
          ) : (
            <button
              onClick={clearSelection}
              className="text-[11px] text-[#64748b] hover:text-[#f1f5f9] transition-colors"
            >
              Deseleccionar
            </button>
          )}
        </div>
      </div>

      {/* Floating bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="sticky top-2 z-20 flex items-center justify-between gap-3 rounded-xl border border-cyan-500/30 bg-[#0a0f1c]/95 backdrop-blur px-4 py-2.5 shadow-lg shadow-cyan-500/5">
          <span className="text-[12px] font-semibold text-cyan-400">
            {selectedIds.size} alerta{selectedIds.size !== 1 ? "s" : ""}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleBulkAcknowledge}
              disabled={!!bulkAction}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#1a1f2e] bg-[#111827] px-3 py-1.5 text-[11px] font-semibold text-[#94a3b8] hover:text-[#f1f5f9] hover:border-cyan-500/40 transition-colors disabled:opacity-50"
            >
              {bulkAction === "acknowledge" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
              Reconocer
            </button>
            <button
              onClick={handleBulkResolve}
              disabled={!!bulkAction}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-semibold text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
            >
              {bulkAction === "resolve" ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
              Resolver
            </button>
          </div>
        </div>
      )}

      {/* Cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {filtered.map((a: any) => (
          <AlertaCard
            key={a.id}
            alerta={a}
            onAcknowledge={handleAcknowledge}
            onResolve={handleResolve}
            selected={selectedIds.has(a.id)}
            onToggleSelect={toggleSelect}
          />
        ))}
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4">
            <ShieldCheck className="w-6 h-6 text-emerald-400" />
          </div>
          <p className="text-[15px] font-semibold text-[#f1f5f9] mb-1">Sin alertas activas</p>
          <p className="text-[13px] text-[#94a3b8]">
            Sistema activo · Monitoreando {rows.length} ejecuciones
          </p>
        </div>
      )}

      {/* Detection engine info */}
      <div className="rounded-xl border border-[#1a1f2e] bg-[#111827] p-4 space-y-2">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-cyan-400" />
          <h4 className="text-[13px] font-semibold text-[#f1f5f9]">Motor de detección automática</h4>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {[
            "Guardia estático (sin movimiento > 5 min)",
            "Checkpoint saltado (fuera de secuencia)",
            "Velocidad anómala (diferente al patrón)",
            "Ronda no iniciada (pasada hora + tolerancia)",
            "Breach de geocerca (fuera del radio)",
            "Botón de pánico (activado por guardia)",
          ].map((item) => (
            <div key={item} className="flex items-center gap-1.5">
              <span className="w-1 h-1 rounded-full bg-cyan-400 shrink-0" />
              <span className="text-[11px] text-[#94a3b8]">{item}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
