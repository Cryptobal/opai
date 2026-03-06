"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MonitoreoMap } from "@/components/ops/rondas/monitoreo-map";
import { MonitoreoGuardPanel } from "@/components/ops/rondas/MonitoreoGuardPanel";
import { MonitoreoTurnoHeader } from "@/components/ops/rondas/MonitoreoTurnoHeader";
import { CerrarTurnoModal } from "@/components/ops/rondas/CerrarTurnoModal";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { formatPersonName } from "@/lib/personas";
import { toast } from "sonner";

interface Installation {
  id: string;
  name: string;
}

export function RondasMonitoreoClient({
  initialRows,
  installations,
  alertCount,
  userId,
  userName,
}: {
  initialRows: any[];
  installations: Installation[];
  alertCount: number;
  userId: string;
  userName: string;
}) {
  const [rows, setRows] = useState<any[]>(initialRows);
  const [installationFilter, setInstallationFilter] = useState("");
  const [selectedRondaId, setSelectedRondaId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [closeTurnoId, setCloseTurnoId] = useState<string | null>(null);
  const [currentAlertCount, setCurrentAlertCount] = useState(alertCount);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const [monRes, alertRes] = await Promise.all([
          fetch("/api/ops/rondas/monitoreo"),
          fetch("/api/ops/rondas/alertas?open=true"),
        ]);
        const [monJson, alertJson] = await Promise.all([monRes.json(), alertRes.json()]);
        if (monJson.success) setRows(monJson.data);
        if (alertJson.success) setCurrentAlertCount(alertJson.data.length);
      } catch { /* ignore polling errors */ }
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const filtered = useMemo(
    () => installationFilter
      ? rows.filter((r: any) => r.rondaTemplate?.installation?.id === installationFilter)
      : rows,
    [rows, installationFilter],
  );

  const mapCheckpoints = useMemo(() => {
    const cps: any[] = [];
    filtered.forEach((r: any) => {
      const markedIds = new Set((r.marcaciones ?? []).map((m: any) => m.checkpointId));
      (r.rondaTemplate?.checkpoints ?? []).forEach((tc: any, i: number) => {
        const cp = tc.checkpoint;
        if (cp?.lat != null && cp?.lng != null) {
          cps.push({
            id: `${r.id}-${cp.id}`,
            name: cp.name,
            lat: cp.lat,
            lng: cp.lng,
            radiusM: cp.geoRadiusM ?? 30,
            status: markedIds.has(cp.id) ? "completed" : i === 0 || markedIds.size === i ? "active" : "pending",
          });
        }
      });
    });
    return cps;
  }, [filtered]);

  const mapGuards = useMemo(() => {
    return filtered
      .filter((r: any) => r.marcaciones?.[0]?.lat != null)
      .map((r: any) => ({
        id: r.id,
        label: r.guardia ? formatPersonName(r.guardia.persona.firstName, r.guardia.persona.lastName) : "Guardia",
        lat: r.marcaciones[0].lat,
        lng: r.marcaciones[0].lng,
        hasAlert: (r.alertasRows?.length ?? 0) > 0,
      }));
  }, [filtered]);

  const mapRoutes = useMemo(() => {
    return filtered.map((r: any) =>
      (r.marcaciones ?? [])
        .filter((m: any) => m.lat != null && m.lng != null)
        .sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
        .map((m: any) => ({ lat: m.lat, lng: m.lng })),
    );
  }, [filtered]);

  const mapCenter = useMemo(() => {
    if (filtered[0]?.rondaTemplate?.installation?.lat) {
      return { lat: filtered[0].rondaTemplate.installation.lat, lng: filtered[0].rondaTemplate.installation.lng };
    }
    return null;
  }, [filtered]);

  const guardPanelData = useMemo(() => {
    return filtered.map((r: any) => ({
      id: r.id,
      ejecucionId: r.id,
      guardiaId: r.guardiaId ?? r.guardia?.id ?? null,
      installationId: r.rondaTemplate?.installation?.id ?? null,
      templateName: r.rondaTemplate?.name ?? "Ronda",
      installationName: r.rondaTemplate?.installation?.name ?? "",
      guardiaNombre: r.guardia ? formatPersonName(r.guardia.persona.firstName, r.guardia.persona.lastName) : "Sin asignar",
      guardiaPhone: r.guardia?.persona?.phoneMobile ?? null,
      checkpointsTotal: r.checkpointsTotal,
      checkpointsCompletados: r.checkpointsCompletados,
      trustScore: r.trustScore ?? 0,
      startedAt: r.startedAt ?? r.scheduledAt,
      status: r.status,
      alerts: (r.alertasRows ?? []).map((a: any) => ({
        id: a.id,
        tipo: a.tipo,
        severidad: a.severidad,
        mensaje: a.mensaje,
      })),
      marcaciones: (r.marcaciones ?? []).slice(0, 10).map((m: any) => ({
        checkpointName: m.checkpoint?.name,
        timestamp: m.timestamp,
        lat: m.lat,
        lng: m.lng,
        fotoEvidenciaUrl: m.fotoEvidenciaUrl,
      })),
      incidentes: (r.incidentes ?? []).map((inc: any) => ({
        id: inc.id,
        tipo: inc.tipo,
        descripcion: inc.descripcion,
        fotoUrl: inc.fotoUrl,
        createdAt: inc.createdAt,
      })),
    }));
  }, [filtered]);

  const handleAddNote = useCallback(async (ejecucionId: string, guardiaId: string, installationId: string, note: string) => {
    try {
      const res = await fetch("/api/ops/rondas/monitoreo/nota", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ejecucionId, guardiaId, installationId, descripcion: note }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Nota guardada");
      } else {
        toast.error(json.error ?? "Error al guardar nota");
      }
    } catch {
      toast.error("Error de conexión");
    }
  }, []);

  return (
    <div className="flex flex-col gap-0 min-w-0">
      {/* Top bar: live badge + filter */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-full bg-green-500/10 border border-green-500/20 px-3 py-1.5">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-[11px] font-semibold text-green-400 uppercase tracking-wider">En vivo</span>
          </div>
          <span className="text-[13px] text-[#64748b]">{filtered.length} ronda{filtered.length !== 1 ? "s" : ""} activa{filtered.length !== 1 ? "s" : ""}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-56">
            <SearchableSelect
              value={installationFilter}
              options={[
                { id: "", label: "Todas las instalaciones" },
                ...installations.map((i) => ({ id: i.id, label: i.name })),
              ]}
              placeholder="Filtrar instalación..."
              onChange={setInstallationFilter}
            />
          </div>
          {selectedRondaId && (
            <button
              className="text-[11px] text-[#94a3b8] hover:text-[#f1f5f9] underline"
              onClick={() => setSelectedRondaId(null)}
            >
              Ver todos
            </button>
          )}
        </div>
      </div>

      {/* Turno header */}
      <MonitoreoTurnoHeader
        activeRondasCount={filtered.length}
        alertCount={currentAlertCount}
        onOpenCloseTurno={(id) => setCloseTurnoId(id)}
      />

      {/* Main: map + side panel */}
      <div className={isFullscreen
        ? "fixed inset-0 z-50 bg-[#0a0e1a] p-4"
        : "mt-3 grid grid-cols-1 lg:grid-cols-10 gap-4"
      }>
        {/* Map */}
        <div className={isFullscreen ? "h-full" : "lg:col-span-7 h-[calc(100vh-280px)] min-h-[400px] rounded-xl overflow-hidden border border-[#1e293b]"}>
          <MonitoreoMap
            checkpoints={mapCheckpoints}
            guards={mapGuards}
            routes={mapRoutes}
            center={mapCenter}
            selectedGuardId={selectedRondaId}
            isFullscreen={isFullscreen}
            onFullscreenToggle={() => setIsFullscreen((prev) => !prev)}
          />
        </div>

        {/* Side panel */}
        {!isFullscreen && (
          <div className="lg:col-span-3 flex flex-col rounded-xl border border-[#1e293b] bg-[#111827] overflow-hidden h-[calc(100vh-280px)] min-h-[400px]">
            {/* Panel header */}
            <div className="px-4 py-2.5 border-b border-[#1e293b] shrink-0">
              <p className="text-[11px] uppercase tracking-wider font-semibold text-[#64748b]">Guardias en turno</p>
            </div>

            {/* Guard panel scrollable */}
            <div className="flex-1 overflow-y-auto">
              <MonitoreoGuardPanel
                rondas={guardPanelData}
                onSelectGuard={setSelectedRondaId}
                selectedId={selectedRondaId}
                onAddNote={handleAddNote}
              />
            </div>

            {/* CTA fixed at bottom */}
            <div className="p-3 border-t border-[#1e293b] shrink-0">
              <button
                onClick={() => {
                  const firstId = filtered[0]?.id;
                  if (firstId) setCloseTurnoId(firstId);
                }}
                disabled={filtered.length === 0}
                className="w-full min-h-[44px] py-2.5 rounded-lg bg-[#2dd4bf] text-black text-[13px] font-semibold hover:bg-[#2dd4bf]/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Cerrar turno con resumen IA
              </button>
            </div>
          </div>
        )}
      </div>

      <CerrarTurnoModal
        turnoId={closeTurnoId ?? ""}
        open={!!closeTurnoId}
        onClose={() => setCloseTurnoId(null)}
        onClosed={() => setCloseTurnoId(null)}
      />
    </div>
  );
}
