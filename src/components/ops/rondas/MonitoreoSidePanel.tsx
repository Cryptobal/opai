"use client";

import { useState, useMemo } from "react";
import { AlertTriangle, MapPin, Check, X, Shield, Radio, Clock, AlertCircle, ChevronRight } from "lucide-react";
import { MonitoreoGuardPanel } from "./MonitoreoGuardPanel";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

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
  installations,
  onInstallationClick,
  selectedInstallationId,
  initialTab,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab ?? "rondas");
  const [expandedInstallations, setExpandedInstallations] = useState<Set<string>>(new Set());

  const openAlerts = useMemo(() => alertRows.filter((a) => !a.resuelta), [alertRows]);

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
      badge: openAlerts.length > 0 ? openAlerts.length : undefined,
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
          />
        )}
        {activeTab === "instalaciones" && (
          <InstalacionesTab
            installations={installations}
            onInstallationClick={onInstallationClick}
            selectedId={selectedInstallationId}
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
   ALERTAS TAB
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
}: {
  alerts: AlertRow[];
  loading: boolean;
  resolvingAlertId: string | null;
  resolveNotes: string;
  onSetResolvingAlertId: (id: string | null) => void;
  onSetResolveNotes: (notes: string) => void;
  onResolveAlert: (id: string, notes?: string) => void;
  onGoToAlert: (alert: AlertRow) => void;
}) {
  if (loading) {
    return <div className="px-4 py-8 text-center text-sm text-muted-foreground">Cargando alertas...</div>;
  }

  if (alerts.length === 0) {
    return (
      <div className="px-4 py-8 text-center">
        <Check className="h-8 w-8 mx-auto mb-2 text-emerald-400/40" />
        <p className="text-sm text-muted-foreground">Sin alertas abiertas</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-[#1e293b]">
      {alerts.map((alert) => {
        const isResolving = resolvingAlertId === alert.id;
        const severityColor = alert.severidad === "critical" ? "text-red-400 bg-red-500/20" : alert.severidad === "high" ? "text-orange-400 bg-orange-500/20" : "text-yellow-400 bg-yellow-500/20";
        const alertIcon = alert.severidad === "critical" ? "text-red-400" : alert.severidad === "high" ? "text-orange-400" : "text-yellow-400";
        return (
          <div key={alert.id} className="px-4 py-3 hover:bg-zinc-800/30">
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
      })}
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
}: {
  installations: InstallationCard[];
  onInstallationClick: (id: string) => void;
  selectedId: string | null;
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
                <span className="rounded-full bg-red-500/20 px-1.5 py-0.5 text-[9px] font-bold text-red-400">
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
