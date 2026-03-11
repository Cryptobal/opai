"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { AlertTriangle, MapPin, Check, X, Shield, Radio, Clock, ChevronRight, Loader2, History, ChevronDown, FileText, Moon, Sun, Search } from "lucide-react";
import { MonitoreoGuardPanel } from "./MonitoreoGuardPanel";
import { HistorialGridDialog, type HistorialTurno } from "./HistorialGridDialog";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/* ─── Alert classification ─── */
const COMPLIANCE_ALERT_TYPES = new Set([
  "ronda_no_iniciada",
  "ronda_no_realizada",
  "ronda_incompleta",
]);

const COMPLIANCE_LABELS: Record<string, string> = {
  ronda_no_iniciada: "no iniciadas",
  ronda_no_realizada: "no realizadas",
  ronda_incompleta: "incompletas",
};

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
}: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab ?? "rondas");

  const openAlerts = useMemo(() => alertRows.filter((a) => !a.resuelta), [alertRows]);

  // Badge only counts operational alerts (not compliance)
  const operationalAlertCount = useMemo(
    () => openAlerts.filter((a) => !COMPLIANCE_ALERT_TYPES.has(a.tipo)).length,
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
                    ? "bg-red-500/15 text-red-400"
                    : "bg-[#1a1f2e] text-[#64748b]"
                )}
              >
                {tab.badge}
              </span>
            )}
            {activeTab === tab.key && (
              <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-cyan-400 rounded-full" />
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
}: {
  guardPanelData: any[];
  completedData?: any[];
  selectedRondaId: string | null;
  onSelectGuard: (id: string | null) => void;
  onAddNote: (ejecucionId: string, guardiaId: string, installationId: string, note: string) => Promise<void>;
}) {
  const [showCompleted, setShowCompleted] = useState(false);

  const completadas = completedData?.filter((r: any) => r.status === "completada") ?? [];
  const incompletas = completedData?.filter((r: any) => r.status === "incompleta") ?? [];
  const totalCompleted = completadas.length + incompletas.length;

  return (
    <>
      {/* En curso header */}
      <div className="px-4 py-2 border-b border-[#1a1f2e] flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <p className="text-[11px] uppercase tracking-wider font-semibold text-[#64748b]">En curso</p>
        <span className="ml-auto text-[10px] rounded-full px-1.5 py-0.5 font-semibold bg-emerald-500/20 text-emerald-400">
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
        />
      )}

      {/* Completed section */}
      {totalCompleted > 0 && (
        <>
          <button
            onClick={() => setShowCompleted(!showCompleted)}
            className="w-full px-4 py-2 border-t border-[#1a1f2e] flex items-center gap-2 hover:bg-[#0f1420] transition-colors"
          >
            <Check className="h-3 w-3 text-emerald-400" />
            <p className="text-[11px] uppercase tracking-wider font-semibold text-[#64748b]">
              Completadas
            </p>
            <span className="text-[10px] rounded-full px-1.5 py-0.5 font-semibold bg-emerald-500/20 text-emerald-400">
              {completadas.length}
            </span>
            {incompletas.length > 0 && (
              <span className="text-[10px] rounded-full px-1.5 py-0.5 font-semibold bg-red-500/20 text-red-400">
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
                            isIncomplete ? "bg-red-400" : "bg-emerald-400",
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
                              ? "text-emerald-400"
                              : r.trustScore >= 50
                                ? "text-yellow-400"
                                : "text-red-400",
                          )}
                        >
                          Trust {r.trustScore}
                        </span>
                      )}
                      {isIncomplete && (
                        <span className="shrink-0 text-red-400 font-medium">Incompleta</span>
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

  // Split into operational vs compliance
  const operationalAlerts = useMemo(
    () => filteredAlerts.filter((a) => !COMPLIANCE_ALERT_TYPES.has(a.tipo)),
    [filteredAlerts],
  );
  const complianceAlerts = useMemo(
    () => filteredAlerts.filter((a) => COMPLIANCE_ALERT_TYPES.has(a.tipo)),
    [filteredAlerts],
  );

  // Group compliance by installation
  const complianceByInstallation = useMemo(() => {
    const map = new Map<string, { installationId: string; installationName: string; alerts: AlertRow[]; byType: Map<string, number> }>();
    for (const alert of complianceAlerts) {
      const instId = alert.installation?.id ?? "sin-instalacion";
      const instName = alert.installation?.name ?? "Sin instalación";
      if (!map.has(instId)) {
        map.set(instId, { installationId: instId, installationName: instName, alerts: [], byType: new Map() });
      }
      const group = map.get(instId)!;
      group.alerts.push(alert);
      group.byType.set(alert.tipo, (group.byType.get(alert.tipo) ?? 0) + 1);
    }
    return Array.from(map.values()).sort((a, b) => b.alerts.length - a.alerts.length);
  }, [complianceAlerts]);

  const handleBulkResolve = async (installationId?: string) => {
    const resolveId = installationId ?? "all";
    setBulkResolvingId(resolveId);
    try {
      await onBulkResolveAlerts({
        tipos: Array.from(COMPLIANCE_ALERT_TYPES),
        installationId,
      });
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
            <span className="text-[11px] rounded-full bg-blue-500/20 text-blue-400 px-2 py-0.5 flex items-center gap-1">
              {installationFilter.name}
              <button onClick={onClearInstallationFilter} className="hover:text-blue-300">
                <X className="h-3 w-3" />
              </button>
            </span>
          </div>
        )}
        <div className="px-4 py-8 text-center">
          <Check className="h-8 w-8 mx-auto mb-2 text-emerald-400/40" />
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
          <span className="text-[11px] rounded-full bg-blue-500/20 text-blue-400 px-2 py-0.5 flex items-center gap-1">
            {installationFilter.name}
            <button onClick={onClearInstallationFilter} className="hover:text-blue-300">
              <X className="h-3 w-3" />
            </button>
          </span>
        </div>
      )}

      {/* ── Section 1: Operational alerts ── */}
      {operationalAlerts.length > 0 && (
        <>
          <div className="px-4 py-2 border-b border-[#1a1f2e] flex items-center gap-2">
            <AlertTriangle className="h-3 w-3 text-red-400" />
            <p className="text-[11px] uppercase tracking-wider font-semibold text-[#64748b]">Alertas operacionales</p>
            <span className="ml-auto rounded-full bg-red-500/20 px-1.5 py-0.5 text-[9px] font-bold text-red-400">
              {operationalAlerts.length}
            </span>
          </div>
          <div className="divide-y divide-[#1e293b]">
            {operationalAlerts.map((alert) => (
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

      {/* ── Section 2: Compliance alerts (collapsible, grouped) ── */}
      {complianceAlerts.length > 0 && (
        <>
          <button
            onClick={() => setComplianceExpanded(!complianceExpanded)}
            className="w-full px-4 py-2 border-t border-b border-[#1a1f2e] flex items-center gap-2 hover:bg-zinc-800/30 transition-colors"
          >
            <ChevronRight className={cn("h-3 w-3 text-zinc-500 transition-transform", complianceExpanded && "rotate-90")} />
            <span className="text-[11px] uppercase tracking-wider font-semibold text-[#64748b]">Cumplimiento</span>
            <span className="ml-auto rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold text-amber-400">
              {complianceAlerts.length}
            </span>
          </button>
          {complianceExpanded && (
            <div>
              {complianceByInstallation.map((group) => {
                const summary = Array.from(group.byType.entries())
                  .map(([tipo, count]) => `${count} ${COMPLIANCE_LABELS[tipo] ?? tipo}`)
                  .join(", ");
                const isResolving = bulkResolvingId === group.installationId;
                return (
                  <div key={group.installationId} className="px-4 py-2.5 border-b border-[#1a1f2e]/50 hover:bg-zinc-800/20">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-foreground truncate flex-1">{group.installationName}</span>
                      <button
                        onClick={() => handleBulkResolve(group.installationId)}
                        disabled={isResolving}
                        className="flex items-center gap-1 rounded bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 text-[10px] text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                      >
                        {isResolving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                        Resolver todas
                      </button>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{summary}</p>
                  </div>
                );
              })}
              {/* Global bulk resolve */}
              <div className="px-4 py-3 border-b border-[#1a1f2e]">
                <button
                  onClick={() => handleBulkResolve(installationFilter?.id)}
                  disabled={bulkResolvingId === "all"}
                  className="w-full flex items-center justify-center gap-1.5 rounded bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 text-[11px] font-medium text-amber-400 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
                >
                  {bulkResolvingId === "all" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                  Resolver todo cumplimiento ({complianceAlerts.length})
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
  const severityColor = alert.severidad === "critical" ? "text-red-400 bg-red-500/15" : alert.severidad === "warning" ? "text-amber-400 bg-amber-500/15" : "text-cyan-400 bg-cyan-500/15";
  const alertIcon = alert.severidad === "critical" ? "text-red-400" : alert.severidad === "warning" ? "text-amber-400" : "text-cyan-400";
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
                className="flex items-center gap-1 rounded bg-blue-500/10 border border-blue-500/20 px-2 py-1 text-[10px] text-blue-400 hover:bg-blue-500/20 transition-colors"
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
              className="flex items-center gap-1 rounded bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 text-[10px] text-emerald-400 hover:bg-emerald-500/20 transition-colors"
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
                className="rounded bg-emerald-600 px-2.5 py-1.5 text-[11px] text-white font-medium hover:bg-emerald-500 transition-colors"
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
        const semaforoColor = semaforo === "green" ? "bg-emerald-400" : semaforo === "yellow" ? "bg-amber-400" : "bg-red-400";

        const trustColor =
          inst.activeRondaTrust != null
            ? inst.activeRondaTrust >= 80 ? "text-emerald-400" : inst.activeRondaTrust >= 60 ? "text-amber-400" : "text-red-400"
            : "text-zinc-500";

        return (
          <button
            key={inst.id}
            onClick={() => onInstallationClick(inst.id)}
            className={cn(
              "w-full text-left px-4 py-3 hover:bg-zinc-800/30 transition-colors",
              isSelected && "bg-cyan-500/[0.04] border-l-2 border-l-cyan-400"
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
                  className="rounded-full bg-red-500/20 px-1.5 py-0.5 text-[9px] font-bold text-red-400 hover:bg-red-500/30 transition-colors cursor-pointer"
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
                    <Moon className={cn("h-2.5 w-2.5", nocturnaOk ? "text-emerald-400" : "text-zinc-600")} />
                    <Sun className={cn("h-2.5 w-2.5", diurnaOk ? "text-emerald-400" : "text-zinc-600")} />
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
                      className="flex items-center gap-1.5 text-[10px] text-sky-400 hover:text-sky-300 transition-colors"
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
            className="text-[10px] text-sky-400 hover:text-sky-300 disabled:opacity-50"
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
