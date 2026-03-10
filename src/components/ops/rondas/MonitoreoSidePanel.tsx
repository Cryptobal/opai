"use client";

import { useState, useMemo, useEffect } from "react";
import { AlertTriangle, MapPin, Check, X, Shield, Radio, Clock, AlertCircle, ChevronRight, Loader2 } from "lucide-react";
import { MonitoreoGuardPanel } from "./MonitoreoGuardPanel";
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

/* ─── Upcoming row types ─── */
interface UpcomingRow {
  id: string;
  status: string;
  scheduledAt: string;
  rondaTemplate?: { name?: string; installation?: { id: string; name: string } | null } | null;
  guardia?: { persona: { firstName: string; lastName: string } } | null;
}

/* ─── Props ─── */
interface Props {
  // Rondas tab
  guardPanelData: any[];
  selectedRondaId: string | null;
  onSelectGuard: (id: string | null) => void;
  onAddNote: (ejecucionId: string, guardiaId: string, installationId: string, note: string) => Promise<void>;
  upcomingData: UpcomingRow[];
  formatPersonName: (first: string, last: string) => string;
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

type TabKey = "rondas" | "alertas" | "instalaciones";

export function MonitoreoSidePanel({
  guardPanelData,
  selectedRondaId,
  onSelectGuard,
  onAddNote,
  upcomingData,
  formatPersonName,
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
  const [expandedInstallations, setExpandedInstallations] = useState<Set<string>>(new Set());

  const openAlerts = useMemo(() => alertRows.filter((a) => !a.resuelta), [alertRows]);

  // Badge only counts operational alerts (not compliance)
  const operationalAlertCount = useMemo(
    () => openAlerts.filter((a) => !COMPLIANCE_ALERT_TYPES.has(a.tipo)).length,
    [openAlerts],
  );

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
      label: "Instalaciones",
      icon: <Shield className="h-3 w-3" />,
      badge: installations.length,
    },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex border-b border-[#1e293b] shrink-0">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 px-2 py-2.5 text-[11px] font-medium transition-colors relative",
              activeTab === tab.key
                ? "text-foreground"
                : "text-[#64748b] hover:text-[#94a3b8]"
            )}
          >
            {tab.icon}
            {tab.label}
            {tab.badge != null && tab.badge > 0 && (
              <span
                className={cn(
                  "ml-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold",
                  tab.key === "alertas"
                    ? "bg-red-500/20 text-red-400"
                    : "bg-zinc-700/50 text-zinc-400"
                )}
              >
                {tab.badge}
              </span>
            )}
            {activeTab === tab.key && (
              <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-emerald-400 rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "rondas" && (
          <RondasTab
            guardPanelData={guardPanelData}
            selectedRondaId={selectedRondaId}
            onSelectGuard={onSelectGuard}
            onAddNote={onAddNote}
            upcomingData={upcomingData}
            formatPersonName={formatPersonName}
            expandedInstallations={expandedInstallations}
            setExpandedInstallations={setExpandedInstallations}
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
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   RONDAS TAB
   ═══════════════════════════════════════════════ */
function RondasTab({
  guardPanelData,
  selectedRondaId,
  onSelectGuard,
  onAddNote,
  upcomingData,
  formatPersonName,
  expandedInstallations,
  setExpandedInstallations,
}: {
  guardPanelData: any[];
  selectedRondaId: string | null;
  onSelectGuard: (id: string | null) => void;
  onAddNote: (ejecucionId: string, guardiaId: string, installationId: string, note: string) => Promise<void>;
  upcomingData: UpcomingRow[];
  formatPersonName: (first: string, last: string) => string;
  expandedInstallations: Set<string>;
  setExpandedInstallations: React.Dispatch<React.SetStateAction<Set<string>>>;
}) {
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

  const renderSection = (title: string, icon: ReactNode, rows: UpcomingRow[], sectionKey: string, isMissedSection: boolean) => {
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
      {/* En curso header */}
      <div className="px-4 py-2 border-b border-[#1e293b] flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <p className="text-[11px] uppercase tracking-wider font-semibold text-[#64748b]">En curso</p>
        <span className="ml-auto text-[10px] rounded-full px-1.5 py-0.5 font-semibold bg-emerald-500/20 text-emerald-400">
          {guardPanelData.length}
        </span>
      </div>
      <MonitoreoGuardPanel
        rondas={guardPanelData}
        onSelectGuard={onSelectGuard}
        selectedId={selectedRondaId}
        onAddNote={onAddNote}
      />
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
          <div className="px-4 py-2 border-b border-[#1e293b] flex items-center gap-2">
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
        <div className="px-4 py-2 border-b border-[#1e293b] flex items-center gap-2">
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
          <div className="px-4 py-2 border-b border-[#1e293b] flex items-center gap-2">
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
            className="w-full px-4 py-2 border-t border-b border-[#1e293b] flex items-center gap-2 hover:bg-zinc-800/30 transition-colors"
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
                  <div key={group.installationId} className="px-4 py-2.5 border-b border-[#1e293b]/50 hover:bg-zinc-800/20">
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
              <div className="px-4 py-3 border-b border-[#1e293b]">
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
  const severityColor = alert.severidad === "critical" ? "text-red-400 bg-red-500/20" : alert.severidad === "high" ? "text-orange-400 bg-orange-500/20" : "text-yellow-400 bg-yellow-500/20";
  const alertIcon = alert.severidad === "critical" ? "text-red-400" : alert.severidad === "high" ? "text-orange-400" : "text-yellow-400";

  return (
    <div className="px-4 py-3 hover:bg-zinc-800/30">
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
                className="flex-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-[11px] text-foreground placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
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
  if (installations.length === 0) {
    return <div className="px-4 py-8 text-center text-sm text-muted-foreground">Sin instalaciones</div>;
  }

  return (
    <div className="divide-y divide-[#1e293b]">
      {installations.map((inst) => {
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
              isSelected && "bg-zinc-800/50 border-l-2 border-emerald-400"
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
  );
}
