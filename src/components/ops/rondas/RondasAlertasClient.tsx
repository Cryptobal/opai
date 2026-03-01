"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertaCard } from "@/components/ops/rondas/alerta-card";
import { PageHeader, FilterBar } from "@/components/opai";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { Input } from "@/components/ui/input";
import { Bot, Settings } from "lucide-react";

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

  const severityButtons = [
    { value: "all", label: "Todas" },
    { value: "critical", label: "🔴 Crítica" },
    { value: "warning", label: "🟡 Warning" },
    { value: "info", label: "🔵 Info" },
  ];

  const stateButtons = [
    { value: "all", label: "Todas" },
    { value: "no_resueltas", label: "No resueltas" },
    { value: "no_reconocidas", label: "Sin reconocer" },
    { value: "reconocidas", label: "Reconocidas" },
    { value: "resueltas", label: "Resueltas" },
  ];

  return (
    <div className="space-y-4 min-w-0">
      <PageHeader
        title="Alertas de rondas"
        description="Detección automática por geolocalización, secuencia y comportamiento anómalo."
      />

      <FilterBar>
        <div className="flex flex-wrap gap-2">
          <div className="flex gap-1">
            {severityButtons.map((btn) => (
              <button
                key={btn.value}
                onClick={() => setSeverityFilter(btn.value)}
                className={`rounded-full px-2.5 py-1 text-[11px] border transition-colors ${
                  severityFilter === btn.value
                    ? "bg-primary/10 border-primary/30 text-foreground"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>

          <div className="w-48">
            <SearchableSelect
              value={installationFilter}
              options={[
                { id: "", label: "Todas instalaciones" },
                ...installations.map((i) => ({ id: i.id, label: i.name })),
              ]}
              placeholder="Instalación..."
              onChange={setInstallationFilter}
            />
          </div>

          <div className="flex gap-1">
            {stateButtons.map((btn) => (
              <button
                key={btn.value}
                onClick={() => setStateFilter(btn.value)}
                className={`rounded-full px-2.5 py-1 text-[11px] border transition-colors ${
                  stateFilter === btn.value
                    ? "bg-primary/10 border-primary/30 text-foreground"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>

          <Input type="date" className="h-8 w-36 text-xs" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <Input type="date" className="h-8 w-36 text-xs" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
      </FilterBar>

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

      {filtered.length === 0 && (
        <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          No hay alertas que coincidan con los filtros.
        </div>
      )}

      <div className="rounded-lg border border-border bg-card/50 p-4 space-y-2">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-muted-foreground" />
          <h4 className="text-sm font-medium">Motor de detección automática</h4>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs text-muted-foreground">
          <span>· Guardia estático (sin movimiento &gt; 5 min)</span>
          <span>· Checkpoint saltado (fuera de secuencia)</span>
          <span>· Velocidad anómala (diferente al patrón)</span>
          <span>· Ronda no iniciada (pasada hora + tolerancia)</span>
          <span>· Breach de geocerca (fuera del radio)</span>
          <span>· Botón de pánico (activado por guardia)</span>
        </div>
        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
          <Settings className="h-3 w-3" /> Los umbrales se configurarán en Centro IA (Etapa 7).
        </p>
      </div>
    </div>
  );
}
