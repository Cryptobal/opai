"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MonitoreoMap } from "@/components/ops/rondas/monitoreo-map";
import { MonitoreoTurnoHeader } from "@/components/ops/rondas/MonitoreoTurnoHeader";
import { MonitoreoSidePanel } from "@/components/ops/rondas/MonitoreoSidePanel";
import { CerrarTurnoModal } from "@/components/ops/rondas/CerrarTurnoModal";
import MonitoreoGrid from "@/components/ops/rondas/MonitoreoGrid";
import type { CellModalData, CNInstalacion } from "@/components/ops/rondas/MonitoreoGrid";
import { MonitoreoGridCellModal } from "@/components/ops/rondas/MonitoreoGridCellModal";
import { GuardPanel } from "@/components/ops/rondas/GuardPanel";
import { ChevronUp, ChevronDown, Shield, AlertTriangle, Moon } from "lucide-react";
import { MobileMonitorView } from "@/components/ops/rondas/MobileMonitorView";
import { formatPersonName } from "@/lib/personas";
import { toast } from "sonner";
import Pusher from "pusher-js";
import { PanicAlertBanner } from "./PanicAlertBanner";
import type { PanicAlertData } from "./PanicAlertBanner";
import { CoberturaSheet } from "./CoberturaSheet";
import { InstallationDetailModal } from "./InstallationDetailModal";
import { soundCheckpointMarked, soundRondaCompleted, soundRondaStarted, soundAlert } from "@/lib/rondas/monitor-sounds";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

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
  userRole,
}: {
  initialRows: any[];
  upcomingRows: UpcomingRow[];
  installations: Installation[];
  alertCount: number;
  userId: string;
  userName: string;
  tenantId: string;
  userRole?: string;
}) {
  const [rows, setRows] = useState<any[]>(initialRows);
  const [closingOrphans, setClosingOrphans] = useState(false);
  const [selectedInstallationId, setSelectedInstallationId] = useState<string | null>(null);
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
  const [alertInstallationFilter, setAlertInstallationFilter] = useState<{ id: string; name: string } | null>(null);
  const [sendingCoberturaEmail, setSendingCoberturaEmail] = useState<"nocturno" | "diurno" | null>(null);
  const [coberturaSheetTurno, setCoberturaSheetTurno] = useState<"nocturno" | "diurno" | null>(null);
  const [mapCollapsed, setMapCollapsed] = useState(false);
  const [upcomingData, setUpcomingData] = useState<UpcomingRow[]>(initialUpcoming);
  const [sidePanelTab, setSidePanelTab] = useState<"rondas" | "alertas" | "instalaciones">("rondas");
  const [controlNocturno, setControlNocturno] = useState<any>(null);
  const [activeTurno, setActiveTurno] = useState<{ id: string; operatorId: string; operatorName: string | null; startedAt?: string } | null>(null);
  const [cellModal, setCellModal] = useState<CellModalData | null>(null);
  const [guardPanel, setGuardPanel] = useState<{ instalacion: CNInstalacion; turno: "nocturno" | "diurno" } | null>(null);
  const [splitPct, setSplitPct] = useState(45);
  const [isMobile, setIsMobile] = useState(false);
  const [detailInstallation, setDetailInstallation] = useState<CNInstalacion | null>(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

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

  const refreshMonitoreo = useCallback(async () => {
    try {
      const monRes = await fetch("/api/ops/rondas/monitoreo");
      const monJson = await monRes.json();
      if (monJson.success) {
        setRows(monJson.data);
        setControlNocturno(monJson.controlNocturno ?? null);
        setActiveTurno(monJson.activeTurno ?? null);
      }
    } catch { /* ignore polling errors */ }
  }, []);

  // Filter out ghost upcoming rondas older than the turno start time
  useEffect(() => {
    if (!activeTurno?.startedAt) return;
    const turnoStart = new Date(activeTurno.startedAt).getTime();
    setUpcomingData((prev) =>
      prev.filter((row) => new Date(row.scheduledAt).getTime() >= turnoStart - 60 * 60 * 1000),
    );
  }, [activeTurno?.startedAt]);

  useEffect(() => {
    // Initial fetch
    fetchAlerts();
    refreshMonitoreo();

    const interval = setInterval(() => {
      refreshMonitoreo();
      fetchAlerts();
    }, 10000);
    return () => clearInterval(interval);
  }, [fetchAlerts, refreshMonitoreo]);

  // Real-time events via Pusher
  useEffect(() => {
    if (!tenantId) return;

    const pusher = new Pusher(
      process.env.NEXT_PUBLIC_PUSHER_KEY!,
      { cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER! }
    );
    const channel = pusher.subscribe(`monitoreo-${tenantId}`);

    channel.bind("alerta-panico", (data: PanicAlertData) => {
      setPanicAlerts((prev) => [...prev, data]);
      soundAlert();
      refreshMonitoreo();
      fetchAlerts();
    });

    channel.bind("ronda-started", () => {
      soundRondaStarted();
      refreshMonitoreo();
    });

    channel.bind("checkpoint-marked", () => {
      soundCheckpointMarked();
      refreshMonitoreo();
    });

    channel.bind("ronda-completed", (data: any) => {
      soundRondaCompleted();
      refreshMonitoreo();
      // Browser notification when tab is hidden
      if (document.hidden && typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification("Ronda completada", {
          body: data?.installationName ? `${data.installationName} — Trust ${data?.trustScore ?? "?"}` : "Una ronda fue completada",
          tag: "monitor-ronda",
        });
      }
    });

    channel.bind("alerta-ronda", (data: any) => {
      soundAlert();
      fetchAlerts();
      refreshMonitoreo();
      // Browser notification for critical alerts when tab is hidden
      if (document.hidden && typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification(`\uD83D\uDEA8 ${data?.tipo ?? "Alerta"}`, {
          body: data?.guardiaName
            ? `${data.guardiaName} — ${data.installationName ?? ""}`
            : data?.mensaje ?? "Nueva alerta de ronda",
          tag: "monitor-alert",
        });
      }
    });

    return () => {
      channel.unbind_all();
      pusher.unsubscribe(`monitoreo-${tenantId}`);
      pusher.disconnect();
    };
  }, [tenantId, fetchAlerts, refreshMonitoreo]);

  // Tab title with descubiertas / alert count
  useEffect(() => {
    const descubiertas = controlNocturno?.instalaciones
      ?.filter((i: any) => i.coberturaStatus === "descubierta").length || 0;
    const unackAlerts = alertRows.filter(a => !a.isAcknowledged).length;

    let prefix = "";
    if (descubiertas > 0) prefix = `\uD83D\uDD34 (${descubiertas}) `;
    else if (unackAlerts > 0) prefix = `\u26A0\uFE0F (${unackAlerts}) `;

    document.title = `${prefix}Monitor — OPAI`;
    return () => { document.title = "OPAI"; };
  }, [alertRows, controlNocturno]);

  // Request browser notification permission on mount
  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  // 22:00 nocturna reminder — modal-style alert if cobertura nocturna hasn't been sent
  const [showNocturnaReminder, setShowNocturnaReminder] = useState(false);
  const isCurrentOperator = activeTurno?.operatorId === userId;
  useEffect(() => {
    if (!activeTurno || !isCurrentOperator) return;
    const check = () => {
      const now = new Date();
      if (now.getHours() >= 22) {
        // Check if nocturna was already sent
        fetch("/api/ops/rondas/monitoreo/turno/active")
          .then((r) => r.json())
          .then((json) => {
            if (json.success && json.data?.emailSentTo) {
              if (!json.data.emailSentTo.coberturaNocturnaSentAt) {
                setShowNocturnaReminder(true);
              }
            } else if (json.success) {
              setShowNocturnaReminder(true);
            }
          })
          .catch(() => {});
      }
    };
    check();
    const interval = setInterval(check, 60000); // check every minute
    return () => clearInterval(interval);
  }, [activeTurno, isCurrentOperator]);

  // Show all rows — selectedInstallationId is for highlighting, not filtering
  const filtered = rows;

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
    if (selectedInstallationId) {
      const inst = installations.find((i) => i.id === selectedInstallationId) as any;
      if (inst?.lat != null && inst?.lng != null) return { lat: inst.lat, lng: inst.lng };
    }
    if (filtered[0]?.rondaTemplate?.installation?.lat) {
      return { lat: filtered[0].rondaTemplate?.installation?.lat, lng: filtered[0].rondaTemplate?.installation?.lng };
    }
    return null;
  }, [filtered, selectedInstallationId, installations, mapCenterOverride]);

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
    // Force re-trigger: reset to rondas then immediately set alertas
    setSidePanelTab("rondas");
    requestAnimationFrame(() => setSidePanelTab("alertas"));
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

  const handleBulkResolveAlerts = useCallback(async (filter: { tipos: string[]; installationId?: string }) => {
    try {
      const res = await fetch("/api/ops/rondas/alertas/bulk-resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipos: filter.tipos,
          installationId: filter.installationId,
        }),
      });
      const json = await res.json();
      if (json.success) {
        // Optimistic removal from local state
        setAlertRows((prev) =>
          prev.filter((a) => {
            if (!filter.tipos.includes(a.tipo)) return true;
            if (filter.installationId && a.installation?.id !== filter.installationId) return true;
            return false;
          }),
        );
        setCurrentAlertCount((c) => Math.max(0, c - (json.data?.resolved ?? 0)));
        toast.success(`${json.data?.resolved ?? 0} alertas resueltas`);
      } else {
        toast.error(json.error ?? "Error al resolver alertas");
      }
    } catch {
      toast.error("Error de conexión");
    }
  }, []);

  const handleSendCoberturaEmail = useCallback(async (turnoFilter: "nocturno" | "diurno") => {
    setSendingCoberturaEmail(turnoFilter);
    const label = turnoFilter === "nocturno" ? "nocturna" : "diurna";
    try {
      const res = await fetch("/api/ops/rondas/monitoreo/cobertura-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ turnoFilter }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(`Cobertura ${label} enviada a operaciones y al chat`);
      } else {
        toast.error(json.error ?? "Error al enviar cobertura");
      }
    } catch {
      toast.error("Error de conexión");
    } finally {
      setSendingCoberturaEmail(null);
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

  const handleGuardiaUpdate = useCallback((guardiaId: string, data: { status?: string; horaLlegada?: string | null; notes?: string | null; reemplazaDe?: string | null }) => {
    if (!guardPanel) return;
    const controlInstalacionId = guardPanel.instalacion.id;
    // Optimistic update
    setControlNocturno((prev: any) => {
      if (!prev) return prev;
      return {
        ...prev,
        instalaciones: prev.instalaciones.map((inst: any) => {
          if (inst.id !== controlInstalacionId) return inst;
          return {
            ...inst,
            guardias: inst.guardias.map((g: any) =>
              g.id === guardiaId ? { ...g, ...data } : g,
            ),
          };
        }),
      };
    });
    // Also update the panel's local view
    setGuardPanel((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        instalacion: {
          ...prev.instalacion,
          guardias: prev.instalacion.guardias.map((g) =>
            g.id === guardiaId ? { ...g, ...data } : g,
          ),
        },
      };
    });
    // Fire-and-forget API call
    fetch("/api/ops/rondas/monitoreo/grid/guardias", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ controlInstalacionId, singleGuard: { id: guardiaId, ...data } }),
    }).catch(() => refreshMonitoreo());
  }, [refreshMonitoreo, guardPanel]);

  const handleGuardiaAdd = useCallback(async (data: { guardiaNombre: string; guardiaId?: string | null; isExtra: boolean; turno: string }) => {
    if (!guardPanel) return;
    try {
      const res = await fetch("/api/ops/rondas/monitoreo/grid/guardias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ controlInstalacionId: guardPanel.instalacion.id, ...data }),
      });
      const json = await res.json();
      if (json.success) {
        refreshMonitoreo();
        // Update panel with new guard
        if (json.guardia) {
          setGuardPanel((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              instalacion: {
                ...prev.instalacion,
                guardias: [...prev.instalacion.guardias, json.guardia],
              },
            };
          });
        }
      }
    } catch { /* ignore */ }
  }, [refreshMonitoreo, guardPanel]);

  const handleGuardiaDelete = useCallback(async (guardiaId: string) => {
    if (!guardPanel) return;
    const controlInstalacionId = guardPanel.instalacion.id;
    // Optimistic remove
    setGuardPanel((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        instalacion: {
          ...prev.instalacion,
          guardias: prev.instalacion.guardias.filter((g) => g.id !== guardiaId),
        },
      };
    });
    setControlNocturno((prev: any) => {
      if (!prev) return prev;
      return {
        ...prev,
        instalaciones: prev.instalaciones.map((inst: any) => {
          if (inst.id !== controlInstalacionId) return inst;
          return { ...inst, guardias: inst.guardias.filter((g: any) => g.id !== guardiaId) };
        }),
      };
    });
    fetch("/api/ops/rondas/monitoreo/grid/guardias", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ controlInstalacionId, guardias: [{ id: guardiaId, _delete: true, guardiaNombre: "" }] }),
    }).catch(() => refreshMonitoreo());
  }, [refreshMonitoreo, guardPanel]);

  const handleCellSave = useCallback(async (rondaId: string, update: { status: string; horaMarcada: string | null; notes: string | null }) => {
    try {
      const res = await fetch("/api/ops/rondas/monitoreo/grid/cell", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ controlNocturnoRondaId: rondaId, ...update }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Celda actualizada");
        setCellModal(null);
        refreshMonitoreo();
      } else {
        toast.error(json.error ?? "Error al actualizar celda");
      }
    } catch {
      toast.error("Error de conexión");
    }
  }, [refreshMonitoreo]);

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

  const orphanCount = rows.filter((r: any) => {
    if (!r.isAdHoc || r.status !== "en_curso" || !r.startedAt) return false;
    const hoursOpen = (Date.now() - new Date(r.startedAt).getTime()) / 3600000;
    return hoursOpen > 4;
  }).length;

  const handleCloseOrphans = async () => {
    if (!confirm(`¿Cerrar ${orphanCount} ronda${orphanCount !== 1 ? "s" : ""} libre${orphanCount !== 1 ? "s" : ""} huérfana${orphanCount !== 1 ? "s" : ""}?`)) return;
    setClosingOrphans(true);
    try {
      const res = await fetch("/api/ops/rondas/cerrar-huerfanas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxHoursOpen: 4 }),
      });
      const json = await res.json();
      if (json.success) {
        refreshMonitoreo();
      }
    } finally {
      setClosingOrphans(false);
    }
  };

  const isOperator = activeTurno?.operatorId === userId;
  const isReadOnly = !!activeTurno && !isOperator;

  return (
    <div className="flex flex-col min-w-0 h-[calc(100vh-64px)]">
      <PanicAlertBanner
        alerts={panicAlerts}
        onAcknowledge={(alertaId) => {
          setCurrentAlertCount((c) => Math.max(0, c - 1));
        }}
      />
      {/* Turno header */}
      <MonitoreoTurnoHeader
        key={activeTurno?.id ?? "no-turno"}
        activeRondasCount={filtered.filter((r: any) => r.status === "en_curso").length}
        completedCount={rows.filter((r: any) => r.status === "completada").length}
        missedCount={rows.filter((r: any) => r.status === "no_realizada" || r.status === "incompleta").length}
        trustAvg={(() => { const scored = rows.filter((r: any) => r.trustScore != null); return scored.length > 0 ? Math.round(scored.reduce((s: number, r: any) => s + r.trustScore, 0) / scored.length) : 0; })()}
        alertCount={currentAlertCount}
        operatorName={userName}
        onOpenCloseTurno={isReadOnly ? undefined : (id) => setCloseTurnoId(id)}
        onToggleAlerts={handleToggleAlerts}
        onTurnoStarted={refreshMonitoreo}
        isReadOnly={isReadOnly}
        orphanCount={orphanCount}
        onCloseOrphans={handleCloseOrphans}
        closingOrphans={closingOrphans}
        onOpenCoberturaSheet={isReadOnly ? undefined : (t) => setCoberturaSheetTurno(t)}
        onSendCoberturaEmail={isReadOnly ? undefined : handleSendCoberturaEmail}
        sendingCoberturaEmail={sendingCoberturaEmail}
      />

      {/* Observer / Operator banner */}
      {isReadOnly && (
        <div className="hidden md:flex items-center justify-center gap-2 px-4 py-1 bg-[#0a0f1c]/80 border-b border-[#1a1f2e]">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] text-[#64748b]">
            Modo observador — <span className="text-emerald-400 font-medium">{activeTurno?.operatorName ?? "Operador"}</span> opera el turno
          </span>
        </div>
      )}
      {isOperator && activeTurno && (
        <div className="hidden md:flex items-center justify-center gap-2 px-4 py-0.5 bg-cyan-500/3 border-b border-cyan-500/10">
          <span className="text-[10px] text-cyan-400/50">Operando este turno</span>
        </div>
      )}

      {isMobile ? (
        <MobileMonitorView
          controlNocturno={controlNocturno}
          activeTurno={activeTurno}
          alerts={alertRows}
          activeRondas={rows}
          isReadOnly={isReadOnly}
          currentUserId={userId}
          installations={installations}
          mapCheckpoints={mapCheckpoints}
          mapGuards={mapGuards}
          mapInstallations={mapInstallations}
          mapAlertMarkers={mapAlertMarkers}
          mapCenter={mapCenter}
          selectedRondaId={selectedRondaId}
          onInstallationClick={(id) => setSelectedInstallationId(id)}
          onGuardClick={(inst, turno) => setGuardPanel({ instalacion: inst, turno })}
        />
      ) : !activeTurno && !controlNocturno ? (
        /* Sin turno activo — empty state */
        <div className="flex-1 flex items-center justify-center bg-[#080c16]">
          <div className="text-center max-w-sm px-6">
            <div className="w-16 h-16 rounded-2xl bg-[#0a0f1c] border border-[#1a1f2e] flex items-center justify-center mx-auto mb-4">
              <Shield className="h-7 w-7 text-[#475569]" />
            </div>
            <h2 className="text-[16px] font-semibold text-[#94a3b8] mb-2">No hay turno activo</h2>
            <p className="text-[12px] text-[#64748b] leading-relaxed mb-6">
              Inicia un turno de monitoreo para ver la planilla de control, mapa de guardias y alertas en tiempo real.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Fullscreen map overlay */}
          {isFullscreen && (
            <div className="fixed inset-0 z-50 bg-[#080c16] p-4">
              <MonitoreoMap
                checkpoints={mapCheckpoints}
                guards={mapGuards}
                installations={mapInstallations}
                alerts={mapAlertMarkers}
                center={mapCenter}
                selectedGuardId={selectedRondaId}
                isFullscreen={isFullscreen}
                onFullscreenToggle={() => setIsFullscreen(false)}
                onInstallationClick={(id) => setSelectedInstallationId(id)}
              />
            </div>
          )}

          {/* 3-zone layout: [Left: Map + Grid] | [Right: Side Panel] */}
          {!isFullscreen && (
            <div className="flex-1 flex overflow-hidden gap-2 p-2 pt-1" data-monitor-layout>
              {/* Left zone: Map (collapsible) + Grid */}
              <div className="flex-1 flex flex-col min-w-0 gap-1.5">
                {/* Map with collapse toggle */}
                {!mapCollapsed && (
                  <div className="relative rounded-lg overflow-hidden border border-[#1a1f2e]" style={{ height: `${splitPct}%`, minHeight: 180 }}>
                    <MonitoreoMap
                      checkpoints={mapCheckpoints}
                      guards={mapGuards}
                      installations={mapInstallations}
                      alerts={mapAlertMarkers}
                      center={mapCenter}
                      selectedGuardId={selectedRondaId}
                      isFullscreen={false}
                      onFullscreenToggle={() => setIsFullscreen(true)}
                      onInstallationClick={(id) => setSelectedInstallationId(id)}
                    />
                  </div>
                )}
                {/* Map collapse bar */}
                <button
                  onClick={() => setMapCollapsed((v) => !v)}
                  className="flex items-center justify-center gap-1 h-5 rounded bg-[#0a0f1c] border border-[#1a1f2e] text-[#64748b] hover:text-[#94a3b8] hover:border-[#2a3040] transition-colors shrink-0"
                >
                  {mapCollapsed ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
                  <span className="text-[9px] uppercase tracking-wider font-semibold">{mapCollapsed ? "Mostrar mapa" : "Ocultar mapa"}</span>
                </button>
                {/* Grid */}
                <div className="flex-1 min-h-0 rounded-lg border border-[#1a1f2e] overflow-hidden">
                  <MonitoreoGrid
                    controlNocturno={controlNocturno}
                    turnoId={activeTurno?.id ?? null}
                    selectedInstallationId={selectedInstallationId}
                    onSelectInstallation={setSelectedInstallationId}
                    onCellClick={(data) => {
                      // Enrich with ronda execution info if available
                      if (data.ronda.ejecucionRondaId) {
                        const exec = rows.find((r: any) => r.id === data.ronda.ejecucionRondaId);
                        if (exec) {
                          setCellModal({
                            ...data,
                            guardiaName: exec.guardia
                              ? formatPersonName(exec.guardia.persona.firstName, exec.guardia.persona.lastName)
                              : null,
                            templateName: exec.rondaTemplate?.name ?? null,
                            scheduledAt: exec.scheduledAt ?? null,
                          });
                          return;
                        }
                      }
                      setCellModal(data);
                    }}
                    onGuardClick={(inst, turno) => setGuardPanel({ instalacion: inst, turno })}
                    onInstallationDetail={setDetailInstallation}
                    isReadOnly={isReadOnly}
                  />
                </div>
              </div>

              {/* Right zone: Side Panel (full height) */}
              <div className="w-80 flex-shrink-0 flex flex-col rounded-lg border border-[#1a1f2e] bg-[#0a0f1c] overflow-hidden">
                <MonitoreoSidePanel
                  guardPanelData={guardPanelData}
                  selectedRondaId={selectedRondaId}
                  onSelectGuard={setSelectedRondaId}
                  onAddNote={handleAddNote}
                  alertRows={alertRows}
                  alertsLoading={alertsLoading}
                  resolvingAlertId={resolvingAlertId}
                  resolveNotes={resolveNotes}
                  onSetResolvingAlertId={setResolvingAlertId}
                  onSetResolveNotes={setResolveNotes}
                  onResolveAlert={handleResolveAlert}
                  onGoToAlert={handleGoToAlert}
                  alertInstallationFilter={alertInstallationFilter}
                  onSetAlertInstallationFilter={setAlertInstallationFilter}
                  onBulkResolveAlerts={handleBulkResolveAlerts}
                  installations={mapInstallations}
                  onInstallationClick={(id) => setSelectedInstallationId(id)}
                  selectedInstallationId={selectedInstallationId}
                  initialTab={sidePanelTab}
                />
              </div>
            </div>
          )}
        </>
      )}

      {/* Cell modal */}
      {cellModal && (
        <MonitoreoGridCellModal
          data={cellModal}
          onClose={() => setCellModal(null)}
          onSave={handleCellSave}
          isReadOnly={isReadOnly}
        />
      )}

      {/* Guard slide-in panel */}
      {guardPanel && (
        <GuardPanel
          instalacion={guardPanel.instalacion}
          turno={guardPanel.turno}
          onClose={() => setGuardPanel(null)}
          onGuardiaUpdate={handleGuardiaUpdate}
          onGuardiaAdd={handleGuardiaAdd}
          onGuardiaDelete={handleGuardiaDelete}
          isReadOnly={isReadOnly}
        />
      )}

      {/* Installation detail modal */}
      <InstallationDetailModal
        open={!!detailInstallation}
        onClose={() => setDetailInstallation(null)}
        instalacion={detailInstallation}
        alertRows={alertRows}
      />

      {/* Cobertura sheet */}
      <CoberturaSheet
        open={!!coberturaSheetTurno}
        onClose={() => setCoberturaSheetTurno(null)}
        turnoFilter={coberturaSheetTurno ?? "nocturno"}
        instalaciones={controlNocturno?.instalaciones ?? []}
        onSendCobertura={(t) => {
          handleSendCoberturaEmail(t);
          setCoberturaSheetTurno(null);
        }}
        sendingEmail={sendingCoberturaEmail}
      />

      <CerrarTurnoModal
        turnoId={closeTurnoId ?? ""}
        open={!!closeTurnoId}
        onClose={() => setCloseTurnoId(null)}
        onClosed={() => { setCloseTurnoId(null); refreshMonitoreo(); }}
        onSendCobertura={handleSendCoberturaEmail}
        userRole={userRole}
      />

      {/* 22:00 nocturna reminder modal */}
      <Dialog open={showNocturnaReminder} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-400">
              <AlertTriangle className="h-5 w-5" />
              Cobertura nocturna pendiente
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Son las 22:00 o más y aún no has enviado la cobertura nocturna.
              Debes enviarla para registrar la asistencia de los guardias nocturnos.
            </p>
          </div>
          <DialogFooter>
            <Button
              className="gap-1.5"
              onClick={() => {
                handleSendCoberturaEmail("nocturno");
                setShowNocturnaReminder(false);
              }}
            >
              <Moon className="h-4 w-4" /> Enviar cobertura nocturna
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
