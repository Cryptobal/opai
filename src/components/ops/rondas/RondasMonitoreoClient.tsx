"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MonitoreoMap } from "@/components/ops/rondas/monitoreo-map";
import { MonitoreoGuardPanel } from "@/components/ops/rondas/MonitoreoGuardPanel";
import { MonitoreoTurnoHeader } from "@/components/ops/rondas/MonitoreoTurnoHeader";
import { CerrarTurnoModal } from "@/components/ops/rondas/CerrarTurnoModal";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { formatPersonName } from "@/lib/personas";
import { AlertTriangle, Check, X, MapPin, Clock, AlertCircle, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import Pusher from "pusher-js";
import { PanicAlertBanner } from "./PanicAlertBanner";
import type { PanicAlertData } from "./PanicAlertBanner";

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
  const [alertPanelDismissed, setAlertPanelDismissed] = useState(false);
  const [alertRows, setAlertRows] = useState<AlertRow[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [mapCenterOverride, setMapCenterOverride] = useState<{ lat: number; lng: number } | null>(null);
  const [resolvingAlertId, setResolvingAlertId] = useState<string | null>(null);
  const [resolveNotes, setResolveNotes] = useState("");
  const [upcomingData] = useState<UpcomingRow[]>(initialUpcoming);
  const [expandedInstallations, setExpandedInstallations] = useState<Set<string>>(new Set());

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

  // Real-time panic alerts via Pusher
  useEffect(() => {
    if (!tenantId) return;

    const pusher = new Pusher(
      process.env.NEXT_PUBLIC_PUSHER_KEY!,
      { cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER! }
    );
    const channel = pusher.subscribe(`monitoreo-${tenantId}`);

    channel.bind("alerta-panico", (data: PanicAlertData) => {
      setPanicAlerts((prev) => [...prev, data]);
      // Also refresh data immediately
      fetch("/api/ops/rondas/monitoreo")
        .then((r) => r.json())
        .then((json) => { if (json.success) setRows(json.data); })
        .catch(() => {});
      fetchAlerts();
    });

    return () => {
      channel.unbind_all();
      pusher.unsubscribe(`monitoreo-${tenantId}`);
      pusher.disconnect();
    };
  }, [tenantId]);

  const openAlerts = useMemo(() => alertRows.filter((a) => !a.resuelta), [alertRows]);

  // Auto-open alert panel when new alerts arrive (unless user dismissed)
  useEffect(() => {
    if (openAlerts.length > 0) setAlertPanelDismissed(false);
  }, [openAlerts.length]);

  const showAlertPanel = openAlerts.length > 0 && !alertPanelDismissed;

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

  const handleToggleAlerts = useCallback(async () => {
    if (showAlertPanel) {
      setAlertPanelDismissed(true);
    } else {
      setAlertPanelDismissed(false);
      setAlertsLoading(true);
      await fetchAlerts();
      setAlertsLoading(false);
    }
  }, [showAlertPanel, fetchAlerts]);

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
      </div>

      {/* Turno header */}
      <MonitoreoTurnoHeader
        activeRondasCount={filtered.length}
        alertCount={currentAlertCount}
        onOpenCloseTurno={(id) => setCloseTurnoId(id)}
        onToggleAlerts={handleToggleAlerts}
      />

      {/* Alert details panel — auto-open when alerts exist */}
      {showAlertPanel && (
        <div className="mt-3 rounded-xl border border-red-500/20 bg-red-950/20 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-red-500/10">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-400" />
              <span className="text-sm font-semibold text-red-400">
                {openAlerts.length} alerta{openAlerts.length !== 1 ? "s" : ""} abierta{openAlerts.length !== 1 ? "s" : ""}
              </span>
            </div>
            <button onClick={() => setAlertPanelDismissed(true)} className="p-1 rounded hover:bg-red-900/30 text-red-400">
              <X className="h-4 w-4" />
            </button>
          </div>
          {alertsLoading ? (
            <div className="px-4 py-4 text-center text-sm text-muted-foreground">Cargando alertas...</div>
          ) : (
            <div className="divide-y divide-red-500/10 max-h-[220px] overflow-y-auto">
              {openAlerts.map((alert) => {
                const isResolving = resolvingAlertId === alert.id;
                const severityColor = alert.severidad === "critical" ? "text-red-400 bg-red-500/20" : alert.severidad === "high" ? "text-orange-400 bg-orange-500/20" : "text-yellow-400 bg-yellow-500/20";
                const alertIcon = alert.severidad === "critical" ? "text-red-400" : alert.severidad === "high" ? "text-orange-400" : "text-yellow-400";
                return (
                  <div key={alert.id} className="px-4 py-2.5 hover:bg-red-950/30">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className={`h-4 w-4 shrink-0 mt-0.5 ${alertIcon}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${severityColor}`}>
                            {alert.severidad}
                          </span>
                          <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400">
                            {alert.tipo}
                          </span>
                          {alert.installation?.name && (
                            <span className="text-[11px] text-muted-foreground truncate">{alert.installation.name}</span>
                          )}
                        </div>
                        <p className="text-sm text-foreground">{alert.mensaje}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {new Date(alert.createdAt).toLocaleString("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                          {alert.ejecucion?.rondaTemplate?.name && ` · ${alert.ejecucion.rondaTemplate.name}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {alert.installation && (
                          <button
                            onClick={() => handleGoToAlert(alert)}
                            className="flex items-center gap-1 rounded-lg bg-blue-500/10 border border-blue-500/20 px-2 py-1.5 text-xs text-blue-400 hover:bg-blue-500/20 transition-colors"
                            title="Ver en mapa"
                          >
                            <MapPin className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => {
                            if (isResolving) {
                              setResolvingAlertId(null);
                              setResolveNotes("");
                            } else {
                              setResolvingAlertId(alert.id);
                              setResolveNotes("");
                            }
                          }}
                          className="flex items-center gap-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-2 py-1.5 text-xs text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                          title="Resolver alerta"
                        >
                          <Check className="h-3.5 w-3.5" /> Resolver
                        </button>
                      </div>
                    </div>
                    {/* Inline resolve form */}
                    {isResolving && (
                      <div className="mt-2 ml-7 flex gap-2">
                        <input
                          autoFocus
                          className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-foreground placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                          placeholder="Comentario de resolución (opcional)..."
                          value={resolveNotes}
                          onChange={(e) => setResolveNotes(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleResolveAlert(alert.id, resolveNotes);
                            if (e.key === "Escape") { setResolvingAlertId(null); setResolveNotes(""); }
                          }}
                        />
                        <button
                          onClick={() => handleResolveAlert(alert.id, resolveNotes)}
                          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs text-white font-medium hover:bg-emerald-500 transition-colors"
                        >
                          Confirmar
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

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
            installations={installations as any}
            alerts={mapAlertMarkers}
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

              {/* Upcoming & missed rondas — grouped by installation */}
              {(() => {
                const now = new Date();
                const missed = upcomingData.filter((r) => r.status === "no_realizada" || (r.status === "pendiente" && new Date(r.scheduledAt) < now));
                const upcoming = upcomingData.filter((r) => r.status === "pendiente" && new Date(r.scheduledAt) >= now);

                const groupByInstallation = (rows: UpcomingRow[]) => {
                  const map = new Map<string, { name: string; rows: UpcomingRow[] }>();
                  for (const r of rows) {
                    const instId = r.rondaTemplate?.installation?.id ?? "sin-instalacion";
                    const instName = r.rondaTemplate?.installation?.name ?? "Sin instalación";
                    if (!map.has(instId)) map.set(instId, { name: instName, rows: [] });
                    map.get(instId)!.rows.push(r);
                  }
                  return Array.from(map.entries());
                };

                const toggleExpand = (key: string) => {
                  setExpandedInstallations((prev) => {
                    const next = new Set(prev);
                    if (next.has(key)) next.delete(key);
                    else next.add(key);
                    return next;
                  });
                };

                const renderSection = (title: string, icon: React.ReactNode, rows: UpcomingRow[], sectionKey: string, isMissedSection: boolean) => {
                  if (rows.length === 0) return null;
                  const groups = groupByInstallation(rows);
                  return (
                    <div className="border-t border-[#1e293b]">
                      <div className="px-4 py-2 border-b border-[#1e293b] flex items-center gap-2">
                        {icon}
                        <p className="text-[11px] uppercase tracking-wider font-semibold text-[#64748b]">{title}</p>
                        <span className={`ml-auto text-[10px] rounded-full px-1.5 py-0.5 font-semibold ${isMissedSection ? "bg-red-500/20 text-red-400" : "bg-blue-500/20 text-blue-400"}`}>
                          {rows.length}
                        </span>
                      </div>
                      {groups.map(([instId, { name, rows: instRows }]) => {
                        const key = `${sectionKey}-${instId}`;
                        const isExpanded = expandedInstallations.has(key);
                        return (
                          <div key={key}>
                            <button
                              onClick={() => toggleExpand(key)}
                              className="w-full flex items-center gap-2 px-4 py-2 hover:bg-zinc-800/50 transition-colors"
                            >
                              <ChevronRight className={`h-3 w-3 text-zinc-500 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                              <span className="text-xs font-medium text-foreground">{name}</span>
                              <span className="ml-auto text-[10px] text-zinc-500">{instRows.length}</span>
                            </button>
                            {isExpanded && (
                              <div className="divide-y divide-[#1e293b]/50">
                                {instRows.map((r) => (
                                  <div key={r.id} className={`pl-9 pr-4 py-2 ${isMissedSection ? "bg-red-950/5" : ""}`}>
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs text-foreground">{r.rondaTemplate?.name ?? "Ronda"}</span>
                                      <span className="text-[10px] text-zinc-500">
                                        {new Date(r.scheduledAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
                                      </span>
                                    </div>
                                    {r.guardia && (
                                      <p className="text-[11px] text-muted-foreground">
                                        {formatPersonName(r.guardia.persona.firstName, r.guardia.persona.lastName)}
                                      </p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                };

                return (
                  <>
                    {renderSection(
                      "No realizadas",
                      <AlertCircle className="h-3 w-3 text-red-400" />,
                      missed,
                      "missed",
                      true,
                    )}
                    {renderSection(
                      "Próximas",
                      <Clock className="h-3 w-3 text-blue-400" />,
                      upcoming,
                      "upcoming",
                      false,
                    )}
                  </>
                );
              })()}
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
