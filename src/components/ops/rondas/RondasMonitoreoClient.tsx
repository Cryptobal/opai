"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MonitoreoMap } from "@/components/ops/rondas/monitoreo-map";
import { MonitoreoTurnoHeader } from "@/components/ops/rondas/MonitoreoTurnoHeader";
import { MonitoreoSidePanel } from "@/components/ops/rondas/MonitoreoSidePanel";
import { CerrarTurnoModal } from "@/components/ops/rondas/CerrarTurnoModal";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { formatPersonName } from "@/lib/personas";
import { toast } from "sonner";
import Pusher from "pusher-js";
import { PanicAlertBanner } from "./PanicAlertBanner";
import type { PanicAlertData } from "./PanicAlertBanner";
import { soundCheckpointMarked, soundRondaCompleted, soundRondaStarted, soundAlert } from "@/lib/rondas/monitor-sounds";

interface AlertRow {
  id: string;
  tipo: string;
  severidad: string;
  mensaje: string;
  resuelta: boolean;
  isAcknowledged: boolean;
  createdAt: string;
  installation?: { id: string; name: string } | null;
  ejecucion?: { id: string; status: string; rondaTemplate?: { id: string; name: string } | null } | null;
}

interface Installation {
  id: string;
  name: string;
  lat?: number | null;
  lng?: number | null;
}

interface UpcomingRow {
  id: string;
  status: string;
  scheduledAt: string;
  rondaTemplate?: { name?: string; installation?: { id: string; name: string } | null } | null;
  guardia?: { persona: { firstName: string; lastName: string } } | null;
}

export function RondasMonitoreoClient({
  initialRows,
  upcomingRows: initialUpcoming,
  installations,
  alertCount,
  userId,
  userName,
  tenantId,
}: {
  initialRows: any[];
  upcomingRows: UpcomingRow[];
  installations: Installation[];
  alertCount: number;
  userId: string;
  userName: string;
  tenantId: string;
}) {
  const [rows, setRows] = useState<any[]>(initialRows);
  const [installationFilter, setInstallationFilter] = useState("");
  const [selectedRondaId, setSelectedRondaId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [closeTurnoId, setCloseTurnoId] = useState<string | null>(null);
  const [currentAlertCount, setCurrentAlertCount] = useState(alertCount);
  const [panicAlerts, setPanicAlerts] = useState<PanicAlertData[]>([]);
  const [alertRows, setAlertRows] = useState<AlertRow[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [mapCenterOverride, setMapCenterOverride] = useState<{ lat: number; lng: number } | null>(null);
  const [resolvingAlertId, setResolvingAlertId] = useState<string | null>(null);
  const [resolveNotes, setResolveNotes] = useState("");
  const [upcomingData] = useState<UpcomingRow[]>(initialUpcoming);
  const [sidePanelTab, setSidePanelTab] = useState<"rondas" | "alertas" | "instalaciones">("rondas");

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch("/api/ops/rondas/alertas?open=true");
      const json = await res.json();
      if (json.success) {
        setAlertRows(json.data);
        setCurrentAlertCount(json.data.length);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    // Initial alert fetch
    fetchAlerts();

    const interval = setInterval(async () => {
      try {
        const monRes = await fetch("/api/ops/rondas/monitoreo");
        const monJson = await monRes.json();
        if (monJson.success) setRows(monJson.data);
      } catch { /* ignore polling errors */ }
      fetchAlerts();
    }, 10000);
    return () => clearInterval(interval);
  }, [fetchAlerts]);

  // Real-time events via Pusher
  useEffect(() => {
    if (!tenantId) return;

    const pusher = new Pusher(
      process.env.NEXT_PUBLIC_PUSHER_KEY!,
      { cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER! }
    );
    const channel = pusher.subscribe(`monitoreo-${tenantId}`);

    const refreshRows = () => {
      fetch("/api/ops/rondas/monitoreo")
        .then((r) => r.json())
        .then((json) => { if (json.success) setRows(json.data); })
        .catch(() => {});
    };

    channel.bind("alerta-panico", (data: PanicAlertData) => {
      setPanicAlerts((prev) => [...prev, data]);
      soundAlert();
      refreshRows();
      fetchAlerts();
    });

    channel.bind("ronda-started", () => {
      soundRondaStarted();
      refreshRows();
    });

    channel.bind("checkpoint-marked", () => {
      soundCheckpointMarked();
      refreshRows();
    });

    channel.bind("ronda-completed", () => {
      soundRondaCompleted();
      refreshRows();
    });

    channel.bind("alerta-ronda", () => {
      soundAlert();
      fetchAlerts();
      refreshRows();
    });

    return () => {
      channel.unbind_all();
      pusher.unsubscribe(`monitoreo-${tenantId}`);
      pusher.disconnect();
    };
  }, [tenantId, fetchAlerts]);

  // Tab title with alert count
  useEffect(() => {
    const original = document.title;
    document.title = currentAlertCount > 0 ? `(${currentAlertCount}) Monitoreo` : "Monitoreo";
    return () => { document.title = original; };
  }, [currentAlertCount]);

  // Request browser notification permission on mount
  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
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
      if (r.rondaTemplate) {
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
      } else {
        // Ad-hoc: show marked checkpoints from marcaciones
        (r.marcaciones ?? []).forEach((m: any) => {
          if (m.lat != null && m.lng != null) {
            cps.push({
              id: `${r.id}-${m.checkpointId ?? m.id}`,
              name: m.checkpoint?.name ?? "Checkpoint",
              lat: m.lat,
              lng: m.lng,
              radiusM: 30,
              status: "completed",
            });
          }
        });
      }
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

  const mapCenter = useMemo(() => {
    if (mapCenterOverride) return mapCenterOverride;
    if (installationFilter) {
      const inst = installations.find((i) => i.id === installationFilter) as any;
      if (inst?.lat != null && inst?.lng != null) return { lat: inst.lat, lng: inst.lng };
    }
    if (filtered[0]?.rondaTemplate?.installation?.lat) {
      return { lat: filtered[0].rondaTemplate?.installation?.lat, lng: filtered[0].rondaTemplate?.installation?.lng };
    }
    return null;
  }, [filtered, installationFilter, installations, mapCenterOverride]);

  const guardPanelData = useMemo(() => {
    return filtered.map((r: any) => ({
      id: r.id,
      ejecucionId: r.id,
      guardiaId: r.guardiaId ?? r.guardia?.id ?? null,
      installationId: r.rondaTemplate?.installation?.id ?? null,
      templateName: r.isAdHoc ? "Ronda Libre" : (r.rondaTemplate?.name ?? "Ronda"),
      isAdHoc: r.isAdHoc ?? false,
      installationName: r.rondaTemplate?.installation?.name ?? "",
      guardiaNombre: r.guardia ? formatPersonName(r.guardia.persona.firstName, r.guardia.persona.lastName) : "Sin asignar",
      guardiaPhone: r.guardia?.persona?.phoneMobile ?? null,
      checkpointsTotal: r.checkpointsTotal,
      checkpointsCompletados: r.checkpointsCompletados,
      trustScore: r.trustScore ?? null,
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

  const handleToggleAlerts = useCallback(async () => {
    setSidePanelTab("alertas");
    setAlertsLoading(true);
    await fetchAlerts();
    setAlertsLoading(false);
  }, [fetchAlerts]);

  const handleGoToAlert = useCallback((alert: AlertRow) => {
    const inst = installations.find((i) => i.id === alert.installation?.id);
    if (inst?.lat && inst?.lng) {
      setMapCenterOverride({ lat: inst.lat, lng: inst.lng });
      setTimeout(() => setMapCenterOverride(null), 1500);
    }
  }, [installations]);

  const handleResolveAlert = useCallback(async (alertId: string, notes?: string) => {
    try {
      const res = await fetch("/api/ops/rondas/alertas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: alertId, resolutionNotes: notes || undefined }),
      });
      const json = await res.json();
      if (json.success) {
        setAlertRows((prev) => prev.filter((a) => a.id !== alertId));
        setCurrentAlertCount((c) => Math.max(0, c - 1));
        setResolvingAlertId(null);
        setResolveNotes("");
        toast.success("Alerta resuelta");
      } else {
        toast.error(json.error ?? "Error al resolver alerta");
      }
    } catch {
      toast.error("Error de conexión");
    }
  }, []);

  // Build alert markers for the map — show at installation coords
  const mapAlertMarkers = useMemo(() => {
    return alertRows
      .filter((a) => !a.resuelta)
      .map((a) => {
        // Find installation coords
        const inst = installations.find((i) => i.id === a.installation?.id);
        if (!inst?.lat || !inst?.lng) return null;
        return {
          id: a.id,
          lat: inst.lat as number,
          lng: inst.lng as number,
          label: a.mensaje,
          tipo: a.tipo,
          severidad: a.severidad,
          installationName: a.installation?.name ?? "",
        };
      })
      .filter(Boolean) as Array<{ id: string; lat: number; lng: number; label: string; tipo: string; severidad: string; installationName: string }>;
  }, [alertRows, installations]);

  // Enriched installations for map popups
  const mapInstallations = useMemo(() => {
    return installations.map((inst) => {
      const instRondas = rows.filter((r: any) => (r.rondaTemplate?.installation?.id ?? r.installationId) === inst.id);
      const activeRonda = instRondas.find((r: any) => r.status === "en_curso");
      const instAlerts = alertRows.filter((a) => !a.resuelta && a.installation?.id === inst.id);
      const guardNames = instRondas
        .filter((r: any) => r.guardia)
        .map((r: any) => formatPersonName(r.guardia.persona.firstName, r.guardia.persona.lastName));

      return {
        id: inst.id,
        name: inst.name,
        lat: inst.lat ?? null,
        lng: inst.lng ?? null,
        guardiasPresentes: guardNames.length,
        guardiasRequeridos: 1,
        guardiaNames: guardNames,
        activeRondaProgress: activeRonda ? `${activeRonda.checkpointsCompletados}/${activeRonda.checkpointsTotal}` : null,
        activeRondaTrust: activeRonda?.trustScore ?? null,
        activeRondaStatus: activeRonda?.status ?? null,
        alertCount: instAlerts.length,
      };
    });
  }, [installations, rows, alertRows]);

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
      <PanicAlertBanner
        alerts={panicAlerts}
        onAcknowledge={(alertaId) => {
          setCurrentAlertCount((c) => Math.max(0, c - 1));
        }}
      />
      {/* Compact turno header — all info in 1-2 lines */}
      <MonitoreoTurnoHeader
        activeRondasCount={filtered.filter((r: any) => r.status === "en_curso").length}
        completedCount={rows.filter((r: any) => r.status === "completada").length}
        missedCount={rows.filter((r: any) => r.status === "no_realizada" || r.status === "incompleta").length}
        trustAvg={(() => { const scored = rows.filter((r: any) => r.trustScore != null); return scored.length > 0 ? Math.round(scored.reduce((s: number, r: any) => s + r.trustScore, 0) / scored.length) : 0; })()}
        alertCount={currentAlertCount}
        operatorName={userName}
        onOpenCloseTurno={(id) => setCloseTurnoId(id)}
        onToggleAlerts={handleToggleAlerts}
      />

      {/* Filter bar */}
      <div className="flex items-center gap-2 mt-2">
        <div className="w-56">
          <SearchableSelect
            value={installationFilter}
            options={installations.map((i) => ({ id: i.id, label: i.name }))}
            placeholder="Buscar instalación..."
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
            installations={mapInstallations}
            alerts={mapAlertMarkers}
            center={mapCenter}
            selectedGuardId={selectedRondaId}
            isFullscreen={isFullscreen}
            onFullscreenToggle={() => setIsFullscreen((prev) => !prev)}
            onInstallationClick={(id) => setInstallationFilter(id)}
          />
        </div>

        {/* Side panel with tabs */}
        {!isFullscreen && (
          <div className="lg:col-span-3 flex flex-col rounded-xl border border-[#1e293b] bg-[#111827] overflow-hidden h-[calc(100vh-280px)] min-h-[400px]">
            <MonitoreoSidePanel
              guardPanelData={guardPanelData}
              selectedRondaId={selectedRondaId}
              onSelectGuard={setSelectedRondaId}
              onAddNote={handleAddNote}
              upcomingData={upcomingData}
              formatPersonName={formatPersonName}
              alertRows={alertRows}
              alertsLoading={alertsLoading}
              resolvingAlertId={resolvingAlertId}
              resolveNotes={resolveNotes}
              onSetResolvingAlertId={setResolvingAlertId}
              onSetResolveNotes={setResolveNotes}
              onResolveAlert={handleResolveAlert}
              onGoToAlert={handleGoToAlert}
              installations={mapInstallations}
              onInstallationClick={(id) => setInstallationFilter(id)}
              selectedInstallationId={installationFilter}
              initialTab={sidePanelTab}
            />
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
