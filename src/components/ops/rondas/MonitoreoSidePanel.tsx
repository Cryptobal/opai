"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { AlertTriangle, MapPin, Check, X, Shield, Radio, Clock, ChevronRight, Loader2, History, ChevronDown, FileText, Moon, Sun, Search } from "lucide-react";
import { MonitoreoGuardPanel } from "./MonitoreoGuardPanel";
import { HistorialGridDialog, type HistorialTurno } from "./HistorialGridDialog";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { ALERT_CATALOG, TELEMETRY_ALERT_TYPES, ACTIONABLE_ALERT_TYPES } from "@/lib/rondas/alert-catalog";

/* ─── Alert types ─── */
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

/* ─── Installation card types ─── */
interface InstallationCard {
  id: string;
  name: string;
  guardiasPresentes: number;
  guardiasRequeridos: number;
  guardiaNames: string[];
  activeRondaProgress: string | null;
  activeRondaTrust: number | null;
  activeRondaStatus: string | null;
  alertCount: number;
}

/* ─── Props ─── */
interface Props {
  // Rondas tab
  guardPanelData: any[];
  completedData?: any[];
  selectedRondaId: string | null;
  onSelectGuard: (id: string | null) => void;
  onAddNote: (ejecucionId: string, guardiaId: string, installationId: string, note: string) => Promise<void>;
  // Alertas tab
  alertRows: AlertRow[];
  alertsLoading: boolean;
  resolvingAlertId: string | null;
  resolveNotes: string;
  onSetResolvingAlertId: (id: string | null) => void;
  onSetResolveNotes: (notes: string) => void;
  onResolveAlert: (id: string, notes?: string) => void;
  onGoToAlert: (alert: AlertRow) => void;
  // Alertas: installation filter + bulk resolve
  alertInstallationFilter: { id: string; name: string } | null;
  onSetAlertInstallationFilter: (filter: { id: string; name: string } | null) => void;
  onBulkResolveAlerts: (filter: { tipos: string[]; installationId?: string }) => Promise<void>;
  // Instalaciones tab
  installations: InstallationCard[];
  onInstallationClick: (id: string) => void;
  selectedInstallationId: string | null;
  // Active tab override (from header alert badge)
  initialTab?: "rondas" | "alertas" | "instalaciones";
  // Chat message callback
  onMessage?: (installationId: string) => void;
}

type TabKey = "rondas" | "alertas" | "instalaciones" | "historial";

export function MonitoreoSidePanel({
  guardPanelData,
  completedData,
  selectedRondaId,
  onSelectGuard,
  onAddNote,
  alertRows,
  alertsLoading,
  resolvingAlertId,
  resolveNotes,
  onSetResolvingAlertId,
  onSetResolveNotes,
  onResolveAlert,
  onGoToAlert,
  alertInstallationFilter,
  onSetAlertInstallationFilter,
  onBulkResolveAlerts,
  installations,
  onInstallationClick,
  selectedInstallationId,
  initialTab,
  onMessage,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab ?? "rondas");

  const openAlerts = useMemo(() => alertRows.filter((a) => !a.resuelta), [alertRows]);

  // Badge counts emergency + actionable alerts (not telemetry)
  const operationalAlertCount = useMemo(
    () => openAlerts.filter((a) => {
      const def = (ALERT_CATALOG as Record<string, { level?: string }>)[a.tipo];
      return def?.level === "emergency" || def?.level === "actionable";
    }).length,
    [openAlerts],
  );

  // Switch tab when parent requests it (e.g., alert badge click)
  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);

  // Switch to alertas tab when installation filter is set
  useEffect(() => {
    if (alertInstallationFilter) {
      setActiveTab("alertas");
    }
  }, [alertInstallationFilter]);

  const tabs: { key: TabKey; label: string; icon: ReactNode; badge?: number }[] = [
    {
      key: "rondas",
      label: "Rondas",
      icon: <Radio className="h-3 w-3" />,
      badge: guardPanelData.length,
    },
    {
      key: "alertas",
      label: "Alertas",
      icon: <AlertTriangle className="h-3 w-3" />,
      badge: operationalAlertCount > 0 ? operationalAlertCount : undefined,
    },
    {
      key: "instalaciones",
      label: "Sitios",
      icon: <Shield className="h-3 w-3" />,
      badge: installations.length,
    },
    {
      key: "historial",
      label: "Historial",
      icon: <History className="h-3 w-3" />,
    },
  ];

  return (
    <div className="flex flex-col h-full">
      <PanicBanner alerts={alertRows} onGoToAlert={onGoToAlert} />
      {/* Tab bar */}
      <div className="flex border-b border-[#1a1f2e] shrink-0 bg-[#080c16] overflow-x-auto scrollbar-none">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 px-2 py-2.5 text-[10px] font-semibold uppercase tracking-wider transition-colors relative",
              activeTab === tab.key
                ? "text-[#f1f5f9]"
                : "text-[#475569] hover:text-[#94a3b8]"
            )}
          >
            {tab.icon}
            {tab.label}
            {tab.badge != null && tab.badge > 0 && (
              <span
                className={cn(
                  "ml-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold tabular-nums",
                  tab.key === "alertas"
                    ? "bg-status-danger-soft text-status-danger-fg"
                    : "bg-[#1a1f2e] text-[#64748b]"
                )}
              >
                {tab.badge}
              </span>
            )}
            {activeTab === tab.key && (
              <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-status-info rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "rondas" && (
          <RondasTab
            guardPanelData={guardPanelData}
            completedData={completedData}
            selectedRondaId={selectedRondaId}
            onSelectGuard={onSelectGuard}
            onAddNote={onAddNote}
            onMessage={onMessage}
          />
        )}
        {activeTab === "alertas" && (
          <AlertasTab
            alerts={openAlerts}
            loading={alertsLoading}
            resolvingAlertId={resolvingAlertId}
            resolveNotes={resolveNotes}
            onSetResolvingAlertId={onSetResolvingAlertId}
            onSetResolveNotes={onSetResolveNotes}
            onResolveAlert={onResolveAlert}
            onGoToAlert={onGoToAlert}
            installationFilter={alertInstallationFilter}
            onClearInstallationFilter={() => onSetAlertInstallationFilter(null)}
            onBulkResolveAlerts={onBulkResolveAlerts}
          />
        )}
        {activeTab === "instalaciones" && (
          <InstalacionesTab
            installations={installations}
            onInstallationClick={onInstallationClick}
            selectedId={selectedInstallationId}
            onAlertBadgeClick={(inst) => onSetAlertInstallationFilter(inst)}
          />
        )}
        {activeTab === "historial" && <HistorialTab />}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   RONDAS TAB
   ═══════════════════════════════════════════════ */
function RondasTab({
  guardPanelData,
  completedData,
  selectedRondaId,
  onSelectGuard,
  onAddNote,
  onMessage,
}: {
  guardPanelData: any[];
  completedData?: any[];
  selectedRondaId: string | null;
  onSelectGuard: (id: string | null) => void;
  onAddNote: (ejecucionId: string, guardiaId: string, installationId: string, note: string) => Promise<void>;
  onMessage?: (installationId: string) => void;
}) {
  const [showCompleted, setShowCompleted] = useState(false);

  const completadas = completedData?.filter((r: any) => r.status === "completada") ?? [];
  const incompletas = completedData?.filter((r: any) => r.status === "incompleta") ?? [];
  const totalCompleted = completadas.length + incompletas.length;

  return (
    <>
      {/* En curso header */}
      <div className="px-4 py-2 border-b border-[#1a1f2e] flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-status-ok animate-pulse" />
        <p className="text-[11px] uppercase tracking-wider font-semibold text-[#64748b]">En curso</p>
        <span className="ml-auto text-[10px] rounded-full px-1.5 py-0.5 font-semibold bg-status-ok-soft text-status-ok-fg">
          {guardPanelData.length}
        </span>
      </div>
      {guardPanelData.length === 0 ? (
        <div className="px-4 py-6 text-center">
          <p className="text-xs text-[#64748b]">No hay rondas activas en este momento.</p>
        </div>
      ) : (
        <MonitoreoGuardPanel
          rondas={guardPanelData}
          onSelectGuard={onSelectGuard}
          selectedId={selectedRondaId}
          onAddNote={onAddNote}
          onMessage={onMessage}
        />
      )}

      {/* Completed section */}
      {totalCompleted > 0 && (
        <>
          <button
            onClick={() => setShowCompleted(!showCompleted)}
            className="w-full px-4 py-2 border-t border-[#1a1f2e] flex items-center gap-2 hover:bg-[#0f1420] transition-colors"
          >
            <Check className="h-3 w-3 text-status-ok-fg" />
            <p className="text-[11px] uppercase tracking-wider font-semibold text-[#64748b]">
              Completadas
            </p>
            <span className="text-[10px] rounded-full px-1.5 py-0.5 font-semibold bg-status-ok-soft text-status-ok-fg">
              {completadas.length}
            </span>
            {incompletas.length > 0 && (
              <span className="text-[10px] rounded-full px-1.5 py-0.5 font-semibold bg-status-danger-soft text-status-danger-fg">
                {incompletas.length} incompleta{incompletas.length !== 1 ? "s" : ""}
              </span>
            )}
            <ChevronDown
              className={cn(
                "ml-auto h-3.5 w-3.5 text-[#64748b] transition-transform",
                showCompleted && "rotate-180",
              )}
            />
          </button>
          {showCompleted && (
            <div className="divide-y divide-[#1a1f2e]">
              {[...incompletas, ...completadas].map((r: any) => {
                const guardia = r.guardia;
                const tpl = r.rondaTemplate;
                const inst = tpl?.installation;
                const isIncomplete = r.status === "incompleta";
                const completedAt = r.completedAt ? new Date(r.completedAt) : null;
                const hh = completedAt ? String(completedAt.getHours()).padStart(2, "0") : "--";
                const mm = completedAt ? String(completedAt.getMinutes()).padStart(2, "0") : "--";

                return (
                  <div
                    key={r.id}
                    className={cn(
                      "px-4 py-3",
                      isIncomplete ? "bg-red-950/10" : "bg-[#0a0e1a]",
                    )}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={cn(
                            "w-2 h-2 rounded-full shrink-0",
                            isIncomplete ? "bg-status-danger" : "bg-status-ok",
                          )}
                        />
                        <span className="text-sm font-medium text-white truncate">
                          {guardia?.persona
                            ? `${guardia.persona.firstName} ${guardia.persona.lastName}`
                            : "Guardia"}
                        </span>
                      </div>
                      <span className="text-[10px] text-[#64748b] shrink-0">{hh}:{mm}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-[#64748b] pl-4">
                      <span className="truncate">{inst?.name ?? tpl?.name ?? "—"}</span>
                      <span className="shrink-0">
                        {r.checkpointsCompletados}/{r.checkpointsTotal}
                      </span>
                      {r.trustScore > 0 && (
                        <span
                          className={cn(
                            "shrink-0 font-medium",
                            r.trustScore >= 80
                              ? "text-status-ok-fg"
                              : r.trustScore >= 50
                                ? "text-status-warn-fg"
                                : "text-status-danger-fg",
                          )}
                        >
                          Trust {r.trustScore}
                        </span>
                      )}
                      {isIncomplete && (
                        <span className="shrink-0 text-status-danger-fg font-medium">Incompleta</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </>
  );
}

/* ── Panic Banner: always visible when panic alert exists ── */
function PanicBanner({ alerts, onGoToAlert }: { alerts: AlertRow[]; onGoToAlert: (a: AlertRow) => void }) {
  const panicAlerts = useMemo(
    () => alerts.filter((a) => a.tipo === "panico" && !a.resuelta),
    [alerts],
  );

  if (panicAlerts.length === 0) return null;

  return (
    <div className="bg-gradient-to-r from-red-500/25 to-red-500/10 border-b border-status-danger-border">
      {panicAlerts.map((alert) => (
        <div key={alert.id} className="px-4 py-2.5 flex items-center gap-3">
          <span className="text-lg flex-shrink-0 animate-pulse">🆘</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-status-danger-fg uppercase tracking-wider">
              ALERTA DE PÁNICO
            </p>
            <p className="text-[11px] text-slate-400 truncate">
              {alert.installation?.name ?? "Instalación"} ·{" "}
              {new Date(alert.createdAt).toLocaleTimeString("es-CL", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
          <button
            onClick={() => onGoToAlert(alert)}
            className="flex-shrink-0 rounded bg-status-danger px-3 py-1.5 text-[11px] font-bold text-white hover:bg-status-danger transition-colors"
          >
            Ver
          </button>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   ALERTAS TAB (Two sections: operational + compliance)
   ═══════════════════════════════════════════════ */
function AlertasTab({
  alerts,
  loading,
  resolvingAlertId,
  resolveNotes,
  onSetResolvingAlertId,
  onSetResolveNotes,
  onResolveAlert,
  onGoToAlert,
  installationFilter,
  onClearInstallationFilter,
  onBulkResolveAlerts,
}: {
  alerts: AlertRow[];
  loading: boolean;
  resolvingAlertId: string | null;
  resolveNotes: string;
  onSetResolvingAlertId: (id: string | null) => void;
  onSetResolveNotes: (notes: string) => void;
  onResolveAlert: (id: string, notes?: string) => void;
  onGoToAlert: (alert: AlertRow) => void;
  installationFilter: { id: string; name: string } | null;
  onClearInstallationFilter: () => void;
  onBulkResolveAlerts: (filter: { tipos: string[]; installationId?: string }) => Promise<void>;
}) {
  const [complianceExpanded, setComplianceExpanded] = useState(false);
  const [bulkResolvingId, setBulkResolvingId] = useState<string | null>(null); // "all" or installationId

  // Filter by installation if active
  const filteredAlerts = useMemo(() => {
    if (!installationFilter) return alerts;
    return alerts.filter((a) => a.installation?.id === installationFilter.id);
  }, [alerts, installationFilter]);

  // Split into emergency / actionable / telemetry using alert catalog levels
  const emergencyAlerts = useMemo(
    () => filteredAlerts.filter((a) => {
      const def = (ALERT_CATALOG as Record<string, { level?: string }>)[a.tipo];
      return def?.level === "emergency";
    }),
    [filteredAlerts],
  );
  const actionableAlerts = useMemo(
    () => filteredAlerts.filter((a) => {
      const def = (ALERT_CATALOG as Record<string, { level?: string }>)[a.tipo];
      return def?.level === "actionable";
    }),
    [filteredAlerts],
  );
  const telemetryAlerts = useMemo(
    () => filteredAlerts.filter((a) => {
      const def = (ALERT_CATALOG as Record<string, { level?: string }>)[a.tipo];
      return def?.level === "telemetry" || !def; // Unknown types → telemetry
    }),
    [filteredAlerts],
  );

  // Group telemetry by tipo (with per-installation breakdown)
  const telemetryByType = useMemo(() => {
    const map = new Map<string, { count: number; byInstallation: Map<string, { id: string; name: string; count: number }> }>();
    for (const a of telemetryAlerts) {
      if (!map.has(a.tipo)) map.set(a.tipo, { count: 0, byInstallation: new Map() });
      const entry = map.get(a.tipo)!;
      entry.count += 1;
      const instId = a.installation?.id ?? "sin-instalacion";
      const instName = a.installation?.name ?? "Sin instalación";
      if (!entry.byInstallation.has(instId)) {
        entry.byInstallation.set(instId, { id: instId, name: instName, count: 0 });
      }
      entry.byInstallation.get(instId)!.count += 1;
    }
    return Array.from(map.entries()).sort((a, b) => b[1].count - a[1].count);
  }, [telemetryAlerts]);

  // Expanded telemetry type (shows per-installation breakdown)
  const [expandedTelemetryType, setExpandedTelemetryType] = useState<string | null>(null);

  const handleBulkResolve = async (tipos: string[], installationId?: string) => {
    const resolveId = installationId ?? "all";
    setBulkResolvingId(resolveId);
    try {
      await onBulkResolveAlerts({ tipos, installationId });
    } finally {
      setBulkResolvingId(null);
    }
  };

  if (loading) {
    return <div className="px-4 py-8 text-center text-sm text-muted-foreground">Cargando alertas...</div>;
  }

  if (filteredAlerts.length === 0) {
    return (
      <div>
        {/* Installation filter chip */}
        {installationFilter && (
          <div className="px-4 py-2 border-b border-[#1a1f2e] flex items-center gap-2">
            <span className="text-[11px] rounded-full bg-status-info-soft text-status-info-fg px-2 py-0.5 flex items-center gap-1">
              {installationFilter.name}
              <button onClick={onClearInstallationFilter} className="hover:text-status-info-fg">
                <X className="h-3 w-3" />
              </button>
            </span>
          </div>
        )}
        <div className="px-4 py-8 text-center">
          <Check className="h-8 w-8 mx-auto mb-2 text-status-ok-fg/40" />
          <p className="text-sm text-muted-foreground">Sin alertas abiertas</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Installation filter chip */}
      {installationFilter && (
        <div className="px-4 py-2 border-b border-[#1a1f2e] flex items-center gap-2">
          <span className="text-[11px] rounded-full bg-status-info-soft text-status-info-fg px-2 py-0.5 flex items-center gap-1">
            {installationFilter.name}
            <button onClick={onClearInstallationFilter} className="hover:text-status-info-fg">
              <X className="h-3 w-3" />
            </button>
          </span>
        </div>
      )}

      {/* ── Section 1: Emergency alerts ── */}
      {emergencyAlerts.length > 0 && (
        <>
          <div className="px-4 py-2 border-b border-[#1a1f2e] flex items-center gap-2">
            <AlertTriangle className="h-3 w-3 text-status-danger-fg" />
            <p className="text-[11px] uppercase tracking-wider font-semibold text-status-danger-fg">Emergencias</p>
            <span className="ml-auto rounded-full bg-status-danger-soft px-1.5 py-0.5 text-[9px] font-bold text-status-danger-fg">
              {emergencyAlerts.length}
            </span>
          </div>
          <div className="divide-y divide-[#1e293b]">
            {emergencyAlerts.map((alert) => (
              <AlertCard
                key={alert.id}
                alert={alert}
                isResolving={resolvingAlertId === alert.id}
                resolveNotes={resolveNotes}
                onSetResolvingAlertId={onSetResolvingAlertId}
                onSetResolveNotes={onSetResolveNotes}
                onResolveAlert={onResolveAlert}
                onGoToAlert={onGoToAlert}
              />
            ))}
          </div>
        </>
      )}

      {/* ── Section 2: Actionable alerts ── */}
      {actionableAlerts.length > 0 && (
        <>
          <div className="px-4 py-2 border-t border-b border-[#1a1f2e] flex items-center gap-2">
            <AlertTriangle className="h-3 w-3 text-status-warn-fg" />
            <p className="text-[11px] uppercase tracking-wider font-semibold text-status-warn-fg">Accionables</p>
            <span className="ml-auto rounded-full bg-status-warn-soft px-1.5 py-0.5 text-[9px] font-bold text-status-warn-fg">
              {actionableAlerts.length}
            </span>
          </div>
          <div className="divide-y divide-[#1e293b]">
            {actionableAlerts.map((alert) => (
              <AlertCard
                key={alert.id}
                alert={alert}
                isResolving={resolvingAlertId === alert.id}
                resolveNotes={resolveNotes}
                onSetResolvingAlertId={onSetResolvingAlertId}
                onSetResolveNotes={onSetResolveNotes}
                onResolveAlert={onResolveAlert}
                onGoToAlert={onGoToAlert}
              />
            ))}
          </div>
          {actionableAlerts.length > 3 && (
            <div className="px-4 py-2 border-b border-[#1a1f2e]">
              <button
                onClick={() => handleBulkResolve(ACTIONABLE_ALERT_TYPES, installationFilter?.id)}
                disabled={bulkResolvingId === "all"}
                className="w-full flex items-center justify-center gap-1.5 rounded bg-status-warn-soft border border-status-warn-border px-3 py-1.5 text-[11px] font-medium text-status-warn-fg hover:bg-status-warn-soft transition-colors disabled:opacity-50"
              >
                {bulkResolvingId === "all" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                Resolver todo ({actionableAlerts.length})
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Section 3: Telemetry alerts (collapsible, grouped summary) ── */}
      {telemetryAlerts.length > 0 && (
        <>
          <button
            onClick={() => setComplianceExpanded(!complianceExpanded)}
            className="w-full px-4 py-2 border-t border-b border-[#1a1f2e] flex items-center gap-2 hover:bg-zinc-800/30 transition-colors"
          >
            <ChevronRight className={cn("h-3 w-3 text-zinc-500 transition-transform", complianceExpanded && "rotate-90")} />
            <span className="text-[11px] uppercase tracking-wider font-semibold text-zinc-400">Telemetría</span>
            <span className="ml-auto rounded-full bg-zinc-700/40 px-1.5 py-0.5 text-[9px] font-bold text-zinc-400">
              {telemetryAlerts.length}
            </span>
          </button>
          {complianceExpanded && (
            <div>
              {telemetryByType.map(([tipo, entry]) => {
                const isTypeExpanded = expandedTelemetryType === tipo;
                const installations = Array.from(entry.byInstallation.values()).sort(
                  (a, b) => b.count - a.count,
                );
                return (
                  <div key={tipo} className="border-b border-[#1a1f2e]/40">
                    <button
                      onClick={() => setExpandedTelemetryType(isTypeExpanded ? null : tipo)}
                      className="w-full flex items-center justify-between gap-2 px-4 py-1.5 text-xs hover:bg-zinc-800/20 transition-colors"
                    >
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <ChevronRight
                          className={cn(
                            "h-3 w-3 text-zinc-600 transition-transform",
                            isTypeExpanded && "rotate-90",
                          )}
                        />
                        {(ALERT_CATALOG as any)[tipo]?.label ?? tipo}
                      </span>
                      <span className="font-semibold text-zinc-400">{entry.count}</span>
                    </button>
                    {isTypeExpanded && (
                      <div className="bg-zinc-900/30 pl-8 pr-4 py-1">
                        {installations.map((inst) => (
                          <div
                            key={inst.id}
                            className="flex items-center justify-between py-1 text-[11px] text-zinc-400"
                          >
                            <span className="truncate">{inst.name}</span>
                            <span className="font-medium">{inst.count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {/* Bulk archive telemetry */}
              <div className="px-4 py-3 border-b border-[#1a1f2e]">
                <button
                  onClick={() => handleBulkResolve(TELEMETRY_ALERT_TYPES, installationFilter?.id)}
                  disabled={bulkResolvingId === "all"}
                  className="w-full flex items-center justify-center gap-1.5 rounded bg-zinc-700/30 border border-zinc-600/30 px-3 py-1.5 text-[11px] font-medium text-zinc-300 hover:bg-zinc-700/50 transition-colors disabled:opacity-50"
                >
                  {bulkResolvingId === "all" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                  Auto-archivar todo ({telemetryAlerts.length})
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ── Individual alert card (extracted for reuse) ── */
function AlertCard({
  alert,
  isResolving,
  resolveNotes,
  onSetResolvingAlertId,
  onSetResolveNotes,
  onResolveAlert,
  onGoToAlert,
}: {
  alert: AlertRow;
  isResolving: boolean;
  resolveNotes: string;
  onSetResolvingAlertId: (id: string | null) => void;
  onSetResolveNotes: (notes: string) => void;
  onResolveAlert: (id: string, notes?: string) => void;
  onGoToAlert: (alert: AlertRow) => void;
}) {
  const severityColor = alert.severidad === "critical" ? "text-status-danger-fg bg-status-danger-soft" : alert.severidad === "warning" ? "text-status-warn-fg bg-status-warn-soft" : "text-status-info-fg bg-status-info-soft";
  const alertIcon = alert.severidad === "critical" ? "text-status-danger-fg" : alert.severidad === "warning" ? "text-status-warn-fg" : "text-status-info-fg";
  const leftBorder = alert.severidad === "critical" ? "border-l-red-500" : alert.severidad === "warning" ? "border-l-amber-500" : "border-l-cyan-500";

  return (
    <div className={cn("px-4 py-3 hover:bg-[#0a0f1c]/40 border-l-[3px]", leftBorder)}>
      <div className="flex items-start gap-2.5">
        <AlertTriangle className={`h-4 w-4 shrink-0 mt-0.5 ${alertIcon}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
            <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase ${severityColor}`}>
              {alert.severidad}
            </span>
            <span className="rounded-full bg-zinc-800 px-1.5 py-0.5 text-[9px] text-zinc-400">
              {alert.tipo}
            </span>
          </div>
          <p className="text-xs text-foreground leading-snug">{alert.mensaje}</p>
          <div className="flex items-center gap-1.5 mt-1 text-[10px] text-muted-foreground">
            <span>
              {new Date(alert.createdAt).toLocaleString("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
            </span>
            {alert.installation?.name && (
              <>
                <span className="text-zinc-600">·</span>
                <span className="truncate">{alert.installation.name}</span>
              </>
            )}
          </div>
          {/* Action buttons */}
          <div className="flex items-center gap-1.5 mt-2">
            {alert.installation && (
              <button
                onClick={() => onGoToAlert(alert)}
                className="flex items-center gap-1 rounded bg-status-info-soft border border-status-info-border px-2 py-1 text-[10px] text-status-info-fg hover:bg-status-info-soft transition-colors"
              >
                <MapPin className="h-3 w-3" /> Mapa
              </button>
            )}
            <button
              onClick={() => {
                if (isResolving) {
                  onSetResolvingAlertId(null);
                  onSetResolveNotes("");
                } else {
                  onSetResolvingAlertId(alert.id);
                  onSetResolveNotes("");
                }
              }}
              className="flex items-center gap-1 rounded bg-status-ok-soft border border-status-ok-border px-2 py-1 text-[10px] text-status-ok-fg hover:bg-status-ok-soft transition-colors"
            >
              <Check className="h-3 w-3" /> Resolver
            </button>
          </div>
          {/* Inline resolve form */}
          {isResolving && (
            <div className="mt-2 flex gap-1.5">
              <input
                autoFocus
                className="flex-1 rounded border border-[#1a1f2e] bg-[#0a0f1c] px-2 py-1.5 text-[11px] text-[#f1f5f9] placeholder:text-[#475569] focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
                placeholder="Comentario (opcional)..."
                value={resolveNotes}
                onChange={(e) => onSetResolveNotes(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onResolveAlert(alert.id, resolveNotes);
                  if (e.key === "Escape") { onSetResolvingAlertId(null); onSetResolveNotes(""); }
                }}
              />
              <button
                onClick={() => onResolveAlert(alert.id, resolveNotes)}
                className="rounded bg-status-ok px-2.5 py-1.5 text-[11px] text-white font-medium hover:bg-status-ok transition-colors"
              >
                OK
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   INSTALACIONES TAB
   ═══════════════════════════════════════════════ */
function InstalacionesTab({
  installations,
  onInstallationClick,
  selectedId,
  onAlertBadgeClick,
}: {
  installations: InstallationCard[];
  onInstallationClick: (id: string) => void;
  selectedId: string | null;
  onAlertBadgeClick: (inst: { id: string; name: string }) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return installations;
    const q = searchQuery.toLowerCase();
    return installations.filter((inst) =>
      inst.name.toLowerCase().includes(q)
    );
  }, [installations, searchQuery]);

  if (installations.length === 0) {
    return <div className="px-4 py-8 text-center text-sm text-muted-foreground">Sin instalaciones</div>;
  }

  return (
    <div>
      {/* Search input */}
      <div className="px-3 py-2 border-b border-[#1a1f2e]">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-[#475569]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar instalación..."
            className="w-full h-7 pl-7 pr-2 rounded-md bg-[#0a0f1c] border border-[#1a1f2e] text-[11px] text-[#f1f5f9] placeholder:text-[#475569] focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[#475569] hover:text-[#94a3b8]"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
      {filtered.length === 0 ? (
        <div className="px-4 py-6 text-center text-[11px] text-[#64748b]">
          Sin resultados para &ldquo;{searchQuery}&rdquo;
        </div>
      ) : (
      <div className="divide-y divide-[#1e293b]">
      {filtered.map((inst) => {
        const isSelected = selectedId === inst.id;
        // Semáforo: green if guards present + ronda active, yellow if guards but no ronda, red if no guards or alerts
        const hasAlert = inst.alertCount > 0;
        const hasGuard = inst.guardiasPresentes > 0;
        const hasActiveRonda = inst.activeRondaStatus === "en_curso";
        const semaforo = hasAlert ? "red" : hasGuard && hasActiveRonda ? "green" : hasGuard ? "yellow" : "red";
        const semaforoColor = semaforo === "green" ? "bg-status-ok" : semaforo === "yellow" ? "bg-status-warn" : "bg-status-danger";

        const trustColor =
          inst.activeRondaTrust != null
            ? inst.activeRondaTrust >= 80 ? "text-status-ok-fg" : inst.activeRondaTrust >= 60 ? "text-status-warn-fg" : "text-status-danger-fg"
            : "text-zinc-500";

        return (
          <button
            key={inst.id}
            onClick={() => onInstallationClick(inst.id)}
            className={cn(
              "w-full text-left px-4 py-3 hover:bg-zinc-800/30 transition-colors",
              isSelected && "bg-status-info-soft/30 border-l-2 border-l-status-info"
            )}
          >
            <div className="flex items-center gap-2.5">
              <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", semaforoColor)} />
              <span className="text-xs font-medium text-foreground truncate flex-1">{inst.name}</span>
              {hasAlert && (
                <span
                  role="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAlertBadgeClick({ id: inst.id, name: inst.name });
                  }}
                  className="rounded-full bg-status-danger-soft px-1.5 py-0.5 text-[9px] font-bold text-status-danger-fg hover:brightness-110 transition-colors cursor-pointer"
                  title={`Ver ${inst.alertCount} alertas de ${inst.name}`}
                >
                  {inst.alertCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1.5 ml-5 text-[10px]">
              <span className="text-muted-foreground">
                {inst.guardiasPresentes}/{inst.guardiasRequeridos} guardia{inst.guardiasRequeridos !== 1 ? "s" : ""}
              </span>
              {inst.activeRondaProgress && (
                <span className="text-muted-foreground">
                  Ronda {inst.activeRondaProgress}
                </span>
              )}
              {inst.activeRondaTrust != null && (
                <span className={cn("font-medium", trustColor)}>
                  Trust {inst.activeRondaTrust}
                </span>
              )}
            </div>
            {inst.guardiaNames.length > 0 && (
              <p className="mt-1 ml-5 text-[10px] text-zinc-500 truncate">
                {inst.guardiaNames.join(", ")}
              </p>
            )}
          </button>
        );
      })}
    </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   HISTORIAL TAB
   ═══════════════════════════════════════════════ */
function HistorialTab() {
  const [turnos, setTurnos] = useState<HistorialTurno[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dialogTurno, setDialogTurno] = useState<HistorialTurno | null>(null);

  const fetchHistory = useCallback(async (offset = 0) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ops/rondas/monitoreo/turno/history?limit=20&offset=${offset}`);
      const json = await res.json();
      if (json.success) {
        if (offset === 0) {
          setTurnos(json.data.turnos);
        } else {
          setTurnos((prev) => [...prev, ...json.data.turnos]);
        }
        setTotal(json.data.total);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  if (loading && turnos.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-zinc-500">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        <span className="text-xs">Cargando historial...</span>
      </div>
    );
  }

  if (turnos.length === 0) {
    return (
      <div className="text-center py-12 text-zinc-500 text-xs">
        No hay turnos cerrados
      </div>
    );
  }

  return (
    <>
      <div className="divide-y divide-[#1e293b]">
        {turnos.map((t) => {
          const isExpanded = expandedId === t.id;
          const startDate = new Date(t.startedAt);
          const endDate = t.endedAt ? new Date(t.endedAt) : null;
          const dateStr = startDate.toLocaleDateString("es-CL", { day: "numeric", month: "short" });
          const startTime = startDate.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
          const endTime = endDate?.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" }) ?? "—";

          const coberturas = t.emailSentTo as Record<string, string> | null;
          const nocturnaOk = !!coberturas?.coberturaNocturnaSentAt;
          const diurnaOk = !!coberturas?.coberturaDiurnaSentAt;

          return (
            <div key={t.id} className="px-3 py-2.5">
              {/* Summary row */}
              <button
                onClick={() => setExpandedId(isExpanded ? null : t.id)}
                className="w-full text-left"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">{dateStr}</span>
                  <ChevronDown
                    className={cn(
                      "h-3 w-3 text-zinc-500 transition-transform",
                      isExpanded && "rotate-180",
                    )}
                  />
                </div>
                <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-zinc-400">
                  <Clock className="h-3 w-3" />
                  <span>{startTime} → {endTime}</span>
                  <span className="text-zinc-600">·</span>
                  <span>{t.operatorName ?? "Operador"}</span>
                </div>
                <div className="flex items-center gap-2 mt-1 text-[10px] text-zinc-500">
                  <span>{t.totalRoundsMonitored} rondas</span>
                  <span className="text-zinc-600">·</span>
                  <span>{t.totalAlertsHandled} alertas</span>
                  {/* Cobertura dots */}
                  <span className="ml-auto flex items-center gap-1">
                    <Moon className={cn("h-2.5 w-2.5", nocturnaOk ? "text-status-ok-fg" : "text-zinc-600")} />
                    <Sun className={cn("h-2.5 w-2.5", diurnaOk ? "text-status-ok-fg" : "text-zinc-600")} />
                  </span>
                </div>
              </button>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="mt-2 space-y-2">
                  {t.aiSummary && (
                    <div className="rounded bg-zinc-800/50 p-2 text-[10px] text-zinc-300 whitespace-pre-wrap max-h-[120px] overflow-y-auto">
                      {t.aiSummary}
                    </div>
                  )}
                  {t.operatorComments && (
                    <div className="rounded bg-zinc-800/30 border border-zinc-700/50 p-2 text-[10px] text-zinc-400 italic">
                      {t.operatorComments}
                    </div>
                  )}
                  {t.controlNocturno && (
                    <button
                      onClick={() => setDialogTurno(t)}
                      className="flex items-center gap-1.5 text-[10px] text-status-info-fg hover:text-status-info-fg transition-colors"
                    >
                      <FileText className="h-3 w-3" />
                      Ver planilla de cobertura
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Load more */}
      {turnos.length < total && (
        <div className="p-3 text-center">
          <button
            onClick={() => fetchHistory(turnos.length)}
            disabled={loading}
            className="text-[10px] text-status-info-fg hover:text-status-info-fg disabled:opacity-50"
          >
            {loading ? "Cargando..." : `Cargar más (${turnos.length}/${total})`}
          </button>
        </div>
      )}

      {/* Grid dialog */}
      {dialogTurno && (
        <HistorialGridDialog
          open={!!dialogTurno}
          onClose={() => setDialogTurno(null)}
          turno={dialogTurno}
        />
      )}
    </>
  );
}
