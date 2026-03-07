"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertaCard } from "@/components/ops/rondas/alerta-card";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { Bot, ShieldCheck } from "lucide-react";
import { FilterPills } from "./FilterPills";

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
  const [installationFilter, setInstallationFilter] = useState("");
  const [stateFilter, setStateFilter] = useState<string>("no_resueltas");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const filtered = useMemo(() => {
    let result = rows;

    if (severityFilter !== "all") {
      result = result.filter((a: any) => a.severidad === severityFilter);
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
  }, [rows, severityFilter, installationFilter, stateFilter, dateFrom, dateTo]);

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

  return (
    <div className="space-y-4 min-w-0">
      {/* Filters: 2 rows */}
      <div className="space-y-2">
        {/* Row 1: Severity + Installation + Date range */}
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
              className="h-8 rounded-lg border border-[#1e293b] bg-[#111827] text-[13px] text-[#f1f5f9] px-3 w-36"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-8 rounded-lg border border-[#1e293b] bg-[#111827] text-[13px] text-[#f1f5f9] px-3 w-36"
            />
          </div>
        </div>

        {/* Row 2: State */}
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

      {/* Alert count summary */}
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-[#94a3b8]">
          <span className="font-semibold text-[#f1f5f9]">{filtered.length}</span> alerta{filtered.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {filtered.map((a: any) => (
          <AlertaCard
            key={a.id}
            alerta={a}
            onAcknowledge={handleAcknowledge}
            onResolve={handleResolve}
          />
        ))}
      </div>

      {/* Improved empty state */}
      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mb-4">
            <ShieldCheck className="w-6 h-6 text-green-400" />
          </div>
          <p className="text-[15px] font-semibold text-[#f1f5f9] mb-1">Sin alertas activas</p>
          <p className="text-[13px] text-[#94a3b8]">
            Sistema activo · Monitoreando {rows.length} ejecuciones
          </p>
        </div>
      )}

      {/* Detection engine info */}
      <div className="rounded-xl border border-[#1e293b] bg-[#111827] p-4 space-y-2">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-[#2dd4bf]" />
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
              <span className="w-1 h-1 rounded-full bg-[#2dd4bf] shrink-0" />
              <span className="text-[11px] text-[#94a3b8]">{item}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
