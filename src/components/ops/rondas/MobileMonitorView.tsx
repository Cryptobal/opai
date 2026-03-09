"use client";

import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { MobileInstallationCard } from "./MobileInstallationCard";

const MonitoreoMap = lazy(() =>
  import("@/components/ops/rondas/monitoreo-map").then((m) => ({ default: m.MonitoreoMap }))
);

interface AlertRow {
  id: string;
  tipo: string;
  severidad: string;
  mensaje: string;
  resuelta: boolean;
  isAcknowledged: boolean;
  createdAt: string;
  installation?: { id: string; name: string } | null;
}

interface MobileMonitorViewProps {
  controlNocturno: any;
  activeTurno: { id: string; operatorId: string; operatorName: string | null } | null;
  alerts: AlertRow[];
  activeRondas: any[];
  isReadOnly: boolean;
  currentUserId: string;
  installations: any[];
  mapCheckpoints: any[];
  mapGuards: any[];
  mapInstallations: any[];
  mapAlertMarkers: any[];
  mapCenter: { lat: number; lng: number } | null;
  selectedRondaId: string | null;
  onInstallationClick: (id: string) => void;
  onGuardClick?: (instalacion: any, turno: "nocturno" | "diurno") => void;
}

type MobileTab = "Estado" | "Alertas" | "Mapa";

const FILTERS = ["Todas", "Problemas", "\uD83D\uDD04 Rondas", "\uD83D\uDCDE Manual"] as const;

export function MobileMonitorView({
  controlNocturno,
  activeTurno,
  alerts,
  activeRondas,
  isReadOnly,
  currentUserId,
  installations,
  mapCheckpoints,
  mapGuards,
  mapInstallations,
  mapAlertMarkers,
  mapCenter,
  selectedRondaId,
  onInstallationClick,
  onGuardClick,
}: MobileMonitorViewProps) {
  const [tab, setTab] = useState<MobileTab>("Estado");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("Todas");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [currentTime, setCurrentTime] = useState(() =>
    new Date().toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" }));
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const instalaciones = controlNocturno?.instalaciones ?? [];

  // Auto-expand descubiertas on first render
  useEffect(() => {
    const descubiertas = instalaciones
      .filter((i: any) => i.coberturaStatus === "descubierta")
      .map((i: any) => i.id);
    if (descubiertas.length > 0) {
      setExpandedIds(new Set(descubiertas));
    }
  }, [controlNocturno]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Sort: descubiertas first, then with omitidas, then rest
  const sortedInstallations = useMemo(() => {
    const list = [...instalaciones];
    list.sort((a: any, b: any) => {
      const aDesc = a.coberturaStatus === "descubierta" ? 0 : 1;
      const bDesc = b.coberturaStatus === "descubierta" ? 0 : 1;
      if (aDesc !== bDesc) return aDesc - bDesc;
      const aOmit = (a.rondas ?? []).some((r: any) => r.status === "omitida") ? 0 : 1;
      const bOmit = (b.rondas ?? []).some((r: any) => r.status === "omitida") ? 0 : 1;
      if (aOmit !== bOmit) return aOmit - bOmit;
      return (a.orderIndex ?? 0) - (b.orderIndex ?? 0);
    });
    return list;
  }, [instalaciones]);

  // Apply filter
  const filteredInstallations = useMemo(() => {
    if (filter === "Todas") return sortedInstallations;
    if (filter === "Problemas") {
      return sortedInstallations.filter(
        (i: any) =>
          i.coberturaStatus === "descubierta" ||
          i.coberturaStatus === "parcial" ||
          (i.rondas ?? []).some((r: any) => r.status === "omitida")
      );
    }
    if (filter === "\uD83D\uDD04 Rondas") {
      return sortedInstallations.filter((i: any) => i.monitoreoType === "rondas");
    }
    if (filter === "\uD83D\uDCDE Manual") {
      return sortedInstallations.filter((i: any) => i.monitoreoType !== "rondas");
    }
    return sortedInstallations;
  }, [sortedInstallations, filter]);

  // KPIs
  const kpis = useMemo(() => {
    const allRondas = instalaciones.flatMap((i: any) => i.rondas ?? []);
    const expected = allRondas.filter((r: any) => r.rondaExpected);
    const completadas = allRondas.filter((r: any) => r.status === "completada").length;
    const omitidas = allRondas.filter((r: any) => r.status === "omitida").length;
    const cumplimiento = expected.length > 0
      ? Math.round((expected.filter((r: any) => r.status === "completada").length / expected.length) * 100)
      : 0;
    const scores = allRondas.filter((r: any) => r.trustScore != null);
    const trustAvg = scores.length > 0
      ? Math.round(scores.reduce((a: number, r: any) => a + (r.trustScore ?? 0), 0) / scores.length)
      : 0;
    const unackAlerts = alerts.filter((a) => !a.isAcknowledged).length;

    return [
      { label: "Cumpl.", value: `${cumplimiento}%`, color: cumplimiento >= 80 ? "text-emerald-400" : cumplimiento >= 60 ? "text-amber-400" : "text-red-400", bg: "bg-slate-800/60" },
      { label: "Check-ins", value: `${completadas}`, color: "text-teal-400", bg: "bg-slate-800/60" },
      { label: "Trust", value: `${trustAvg}`, color: trustAvg >= 80 ? "text-emerald-400" : trustAvg >= 60 ? "text-amber-400" : "text-red-400", bg: "bg-slate-800/60" },
      { label: "Omitidas", value: `${omitidas}`, color: omitidas > 0 ? "text-red-400" : "text-slate-500", bg: omitidas > 0 ? "bg-red-500/10" : "bg-slate-800/60" },
      { label: "Alertas", value: `${unackAlerts}`, color: unackAlerts > 0 ? "text-red-400" : "text-slate-500", bg: unackAlerts > 0 ? "bg-red-500/10" : "bg-slate-800/60" },
    ];
  }, [instalaciones, alerts]);

  // Alert counts for tab badge
  const alertCount = alerts.filter((a) => !a.isAcknowledged).length;

  // Sorted alerts for tab
  const sortedAlerts = useMemo(() => {
    return [...alerts].sort((a, b) => {
      // Critical first, then unresolved, then resolved
      if (a.severidad === "critical" && b.severidad !== "critical") return -1;
      if (b.severidad === "critical" && a.severidad !== "critical") return 1;
      if (!a.resuelta && b.resuelta) return -1;
      if (a.resuelta && !b.resuelta) return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [alerts]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Sticky header */}
      <div className="sticky top-0 z-30 bg-slate-900 border-b border-slate-800">
        {/* Turno info */}
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[11px] font-bold text-emerald-400">EN VIVO</span>
            <span className="text-xs text-slate-500">{currentTime}</span>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-slate-400">Op: {activeTurno?.operatorName ?? "—"}</div>
            {controlNocturno && (
              <div className="text-[10px] text-slate-500">
                {controlNocturno.shiftStart}—{controlNocturno.shiftEnd}
              </div>
            )}
          </div>
        </div>

        {/* KPIs row */}
        <div className="flex gap-1.5 px-3 pb-2">
          {kpis.map((kpi) => (
            <div key={kpi.label} className={cn("flex-1 rounded-lg py-1.5 text-center", kpi.bg)}>
              <div className={cn("text-base font-bold", kpi.color)}>{kpi.value}</div>
              <div className="text-[8px] text-slate-500">{kpi.label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex border-t border-slate-800">
          {(["Estado", "Alertas", "Mapa"] as MobileTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "flex-1 py-2 text-xs font-medium transition-colors relative",
                tab === t ? "text-teal-400 border-b-2 border-teal-400" : "text-slate-500"
              )}
            >
              {t}
              {t === "Alertas" && alertCount > 0 && (
                <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-500 text-[9px] text-white font-bold">
                  {alertCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto bg-slate-950">
        {tab === "Estado" && (
          <div>
            {/* Observer banner */}
            {isReadOnly && (
              <div className="mx-3 mt-2 mb-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/60 border border-slate-700/50">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[11px] text-slate-400">
                  Modo observador — <span className="text-emerald-400 font-medium">{activeTurno?.operatorName ?? "Operador"}</span> est&aacute; operando
                </span>
              </div>
            )}

            {/* Filters */}
            <div className="flex gap-1.5 px-3 py-2 sticky top-0 z-10 bg-slate-950/95 backdrop-blur-sm">
              {FILTERS.map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors",
                    filter === f
                      ? "bg-teal-500/20 text-teal-400 border border-teal-500/30"
                      : "bg-slate-800/60 text-slate-500 border border-slate-700/50"
                  )}
                >
                  {f}
                </button>
              ))}
            </div>

            {/* Cards */}
            <div className="px-3 pb-20 space-y-2">
              {filteredInstallations.length === 0 ? (
                <div className="text-center py-8 text-sm text-slate-500">
                  {controlNocturno ? "Sin instalaciones para este filtro" : "Inicia un turno para ver instalaciones"}
                </div>
              ) : (
                filteredInstallations.map((inst: any) => (
                  <MobileInstallationCard
                    key={inst.id}
                    instalacion={inst}
                    expanded={expandedIds.has(inst.id)}
                    onToggle={() => toggleExpand(inst.id)}
                    onGuardClick={onGuardClick}
                  />
                ))
              )}
            </div>
          </div>
        )}

        {tab === "Alertas" && (
          <div className="px-3 py-2 pb-20 space-y-2">
            {sortedAlerts.length === 0 ? (
              <div className="text-center py-8 text-sm text-slate-500">Sin alertas</div>
            ) : (
              sortedAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className={cn(
                    "rounded-xl border px-3 py-2.5",
                    alert.resuelta
                      ? "border-slate-800 bg-slate-900/40 opacity-60"
                      : alert.severidad === "critical"
                        ? "border-red-500/40 bg-red-500/[0.08]"
                        : "border-amber-500/30 bg-amber-500/[0.06]"
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className={cn(
                      "text-[9px] font-bold uppercase px-1.5 py-0.5 rounded",
                      alert.severidad === "critical"
                        ? "bg-red-500/20 text-red-400"
                        : "bg-amber-500/20 text-amber-400"
                    )}>
                      {alert.severidad}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {new Date(alert.createdAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    {alert.resuelta && (
                      <span className="text-[9px] text-emerald-500 ml-auto">Resuelta</span>
                    )}
                  </div>
                  <div className="text-xs text-slate-200">{alert.mensaje}</div>
                  {alert.installation && (
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      {alert.installation.name}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {tab === "Mapa" && (
          <div className="h-full min-h-[60vh]">
            <Suspense fallback={
              <div className="flex items-center justify-center h-full text-slate-500 text-sm">
                Cargando mapa...
              </div>
            }>
              <MonitoreoMap
                checkpoints={mapCheckpoints}
                guards={mapGuards}
                installations={mapInstallations}
                alerts={mapAlertMarkers}
                center={mapCenter}
                selectedGuardId={selectedRondaId}
                isFullscreen={false}
                onFullscreenToggle={() => {}}
                onInstallationClick={onInstallationClick}
              />
            </Suspense>
          </div>
        )}
      </div>
    </div>
  );
}
