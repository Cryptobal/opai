"use client";

import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Loader2,
  BarChart3,
  MapPin,
  Star,
  FileText,
  Bot,
  ShieldCheck,
  MessageSquare,
  ArrowRight,
  UserCheck,
  Ticket,
  ClipboardList,
  DoorOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useBranding } from "@/lib/branding/useBranding";
import { usePortalSession } from "@/contexts/portal-cliente-session-context";
import { usePortalData } from "@/hooks/usePortalData";
import { usePortalClienteRealtime } from "@/hooks/usePortalClienteRealtime";
import { PreviewBadge } from "./PreviewBadge";
import { OpaiBadge } from "./OpaiBadge";
import { DashboardCotizacionesPendientes } from "./cotizaciones/DashboardCotizacionesPendientes";
import { WhatsAppButton } from "./cotizaciones/WhatsAppButton";

interface Summary {
  compliance: number;
  complianceTrend: number;
  completedRounds: number;
  totalRounds: number;
  trustScore: number;
  trustTrend: number;
  /** @deprecated El cliente ya no ve alertas operativas (PR2). Siempre 0. */
  alerts: number;
  /** @deprecated */
  alertsTrend: number;
  attentionCount?: number;
  missedRounds?: number;
  incompleteRounds?: number;
  lastRound?: {
    id: string;
    status: string;
    timestamp: string;
    guardiaName: string | null;
    porcentaje: number;
  } | null;
  rondaEnCurso?: {
    id: string;
    startedAt: string | null;
    checkpointsTotal: number;
    checkpointsCompletados: number;
    porcentaje: number;
    trustScore: number;
    guardiaName: string | null;
  } | null;
  openTickets?: number;
  team?: {
    size: number;
    os10Vigente: number;
    os10PorVencer: number;
    os10Vencido: number;
  };
}
interface DailyPoint {
  date: string;
  compliance: number;
  total: number;
  completed: number;
}
interface Activity {
  id: string;
  type: string;
  timestamp: string;
  icon: string;
  text: string;
  detail?: string;
}

const ICON_COLORS: Record<string, string> = {
  green: "text-emerald-400",
  amber: "text-amber-400",
  red: "text-red-400",
  blue: "text-blue-400",
};
const ICON_COMPONENTS: Record<string, typeof CheckCircle2> = {
  green: CheckCircle2,
  amber: AlertTriangle,
  red: XCircle,
  blue: Clock,
};

const PROSPECT_CAPABILITY_CARDS = [
  { icon: MapPin, title: "Rondas GPS en vivo", desc: "Ve dónde está tu guardia con verificación por geofencing", section: "rondas", color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/15" },
  { icon: Star, title: "Trust Score", desc: "Guardias evaluados con datos reales: asistencia, rondas, capacitación", section: "desempeno", color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/15" },
  { icon: FileText, title: "Documentación digital", desc: "Contratos, OS-10, antecedentes — todo en un click", section: "documentacion", color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/15" },
  { icon: Bot, title: "IA predictiva", desc: "Protocolos y análisis automáticos con inteligencia artificial", section: "desempeno", color: "text-violet-400", bg: "bg-violet-500/10", border: "border-violet-500/15" },
  { icon: ShieldCheck, title: "Control de acceso", desc: "QR, lectura de cédula, registro digital en tiempo real", section: "control-acceso", color: "text-sky-400", bg: "bg-sky-500/10", border: "border-sky-500/15" },
  { icon: MessageSquare, title: "Chat directo", desc: "Habla con tu equipo 24/7 sin salir del portal", section: "chat", color: "text-teal-400", bg: "bg-teal-500/10", border: "border-teal-500/15" },
];

// Accesos directos para CLIENTES activos (reorganizados hacia las vistas clave
// que nacieron en PR3-PR7).
const CLIENT_QUICK_ACTIONS = [
  { icon: MapPin, label: "Rondas", section: "rondas", color: "text-emerald-400", bg: "bg-emerald-500/10" },
  { icon: UserCheck, label: "Marcaciones", section: "marcaciones", color: "text-blue-400", bg: "bg-blue-500/10" },
  { icon: Ticket, label: "Tickets", section: "tickets", color: "text-amber-400", bg: "bg-amber-500/10" },
  { icon: FileText, label: "Documentos", section: "documentacion", color: "text-violet-400", bg: "bg-violet-500/10" },
  { icon: ClipboardList, label: "Instalación", section: "instalacion-detalle", color: "text-teal-400", bg: "bg-teal-500/10" },
  { icon: DoorOpen, label: "Accesos", section: "control-acceso", color: "text-sky-400", bg: "bg-sky-500/10" },
] as const;

function TrendBadge({ value, suffix = "" }: { value: number; suffix?: string }) {
  if (value > 0)
    return (
      <span className="text-emerald-400 text-[10px] flex items-center gap-0.5">
        <TrendingUp className="h-3 w-3" /> +{value}
        {suffix}
      </span>
    );
  if (value < 0)
    return (
      <span className="text-red-400 text-[10px] flex items-center gap-0.5">
        <TrendingDown className="h-3 w-3" /> {value}
        {suffix}
      </span>
    );
  return (
    <span className="text-zinc-500 text-[10px] flex items-center gap-0.5">
      <Minus className="h-3 w-3" /> 0{suffix}
    </span>
  );
}

function KpiCard({
  label,
  value,
  trend,
  color,
}: {
  label: string;
  value: string;
  trend: React.ReactNode;
  color: string;
}) {
  const borderCls =
    color === "emerald"
      ? "border-emerald-500/20"
      : color === "blue"
      ? "border-blue-500/20"
      : color === "red"
      ? "border-red-500/20"
      : color === "amber"
      ? "border-amber-500/20"
      : "border-white/10";
  return (
    <div className={cn("rounded-xl border bg-white/[0.02] p-3", borderCls)}>
      <p className="text-[10px] text-zinc-400 uppercase tracking-wider mb-1">
        {label}
      </p>
      <p className="text-xl font-bold tabular-nums">{value}</p>
      <div className="mt-1">{trend}</div>
    </div>
  );
}

function barColor(pct: number): string {
  if (pct >= 90) return "#22c55e";
  if (pct >= 70) return "#3b82f6";
  return "#f59e0b";
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "hace instantes";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h}h`;
  const d = Math.floor(h / 24);
  return `hace ${d}d`;
}

function formatActivityTimestamp(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  if (sameDay) {
    return d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("es-CL", { day: "2-digit", month: "short" });
}

interface Props {
  selectedInstallation: string;
  onNavigate: (section: string) => void;
}

export function PortalDashboard({ selectedInstallation, onNavigate }: Props) {
  const { session } = usePortalSession();
  const { branding } = useBranding();
  const [daysRange, setDaysRange] = useState(30);

  const baseParams = selectedInstallation ? { installationId: selectedInstallation } : undefined;
  const skipDashboard = !selectedInstallation;

  const summary = usePortalData<Summary>({
    endpoint: "/api/portal/cliente/summary",
    demoKey: "dashboard_summary",
    params: baseParams,
    skip: skipDashboard,
  });
  const compliance = usePortalData<DailyPoint[]>({
    endpoint: "/api/portal/cliente/compliance",
    demoKey: "dashboard_compliance",
    params: { ...(baseParams ?? {}), days: String(daysRange) },
    skip: skipDashboard,
  });
  const activity = usePortalData<Activity[]>({
    endpoint: "/api/portal/cliente/activity",
    demoKey: "dashboard_activity",
    params: baseParams,
    skip: skipDashboard,
  });

  const isProspect = !!session?.isProspect;
  const isLoading = summary.loading || compliance.loading || activity.loading;

  // Realtime: refrescar KPIs y actividad cuando lleguen eventos de la cuenta.
  // Filtramos por instalación seleccionada cuando el evento la trae.
  usePortalClienteRealtime({
    onRondaStarted: (payload) => {
      if (isProspect) return;
      if (
        selectedInstallation &&
        payload.installationId &&
        payload.installationId !== selectedInstallation
      ) {
        return;
      }
      void summary.refetch();
      void activity.refetch();
    },
    onRondaCompleted: (payload) => {
      if (isProspect) return;
      if (
        selectedInstallation &&
        payload.installationId &&
        payload.installationId !== selectedInstallation
      ) {
        return;
      }
      void summary.refetch();
      void compliance.refetch();
      void activity.refetch();
    },
  });

  const instName = useMemo(
    () => session?.installations.find((i) => i.id === selectedInstallation)?.name ?? "",
    [session?.installations, selectedInstallation]
  );

  const chartData = useMemo(
    () =>
      (compliance.data ?? []).slice(-daysRange).map((d) => ({
        ...d,
        label: new Date(d.date + "T12:00:00").toLocaleDateString("es-CL", {
          day: "2-digit",
          month: "short",
        }),
      })),
    [compliance.data, daysRange]
  );

  if (!session) return null;

  const hasRealData = summary.data && summary.data.totalRounds > 0;
  const s = summary.data;
  const attentionCount = s?.attentionCount ?? 0;

  return (
    <div className="px-4 py-4 pb-24 max-w-6xl mx-auto w-full space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white">
          {session.firstName ? `Hola, ${session.firstName}` : `Bienvenido a ${branding.companyName}`}
        </h1>
        {isProspect ? (
          <p className="text-sm text-zinc-400 mt-1">Este es tu centro de comando de seguridad</p>
        ) : (
          instName && <p className="text-sm text-zinc-300 mt-1 font-medium">{instName}</p>
        )}
      </div>

      {/* Presentación activa */}
      {session.hasActivePresentation && (
        <div className="space-y-3">
          <button
            onClick={() => onNavigate("presentacion")}
            className="w-full text-left rounded-2xl p-5 transition-all hover:scale-[1.01] active:scale-[0.99]"
            style={{
              background: "linear-gradient(135deg, rgba(45,212,191,0.15), rgba(45,212,191,0.03))",
              border: "1px solid rgba(45,212,191,0.3)",
            }}
          >
            <div className="text-[11px] font-semibold text-teal-400 uppercase tracking-wider mb-1">
              📋 Presentación personalizada
            </div>
            <div className="text-base font-bold text-white mb-0.5">Conoce {branding.companyName}</div>
            <div className="text-xs text-zinc-400">Descubre nuestros servicios y diferenciadores →</div>
          </button>
          {session.commercialPresentationUrl && (
            <button
              onClick={() => window.open(session.commercialPresentationUrl!, "_blank")}
              className="w-full text-left rounded-2xl p-5 transition-all hover:scale-[1.01] active:scale-[0.99]"
              style={{
                background: "linear-gradient(135deg, rgba(139,92,246,0.12), rgba(139,92,246,0.03))",
                border: "1px solid rgba(139,92,246,0.25)",
              }}
            >
              <div className="text-[11px] font-semibold text-violet-400 uppercase tracking-wider mb-1">
                🏢 Perfil de empresa
              </div>
              <div className="text-base font-bold text-white mb-0.5">Ver perfil comercial</div>
              <div className="text-xs text-zinc-400">Experiencia, tecnología, certificaciones →</div>
            </button>
          )}
        </div>
      )}

      {/* Cotizaciones / propuestas pendientes — siempre visible en el home */}
      <DashboardCotizacionesPendientes
        isProspect={isProspect}
        onNavigateToDetail={(section) => onNavigate(section)}
      />

      {/* Hero dinámico: prioriza ronda en curso, fallback a última ronda */}
      {!isProspect && s?.rondaEnCurso ? (
        <RondaEnCursoHero
          rondaEnCurso={s.rondaEnCurso}
          onNavigate={onNavigate}
        />
      ) : !isProspect && s?.lastRound ? (
        <ServiceStatusHero
          lastRound={s.lastRound}
          attentionCount={attentionCount}
          onNavigate={onNavigate}
        />
      ) : null}

      {/* KPIs de servicio */}
      {s && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">Métricas de servicio</h3>
            {summary.isDemo && <PreviewBadge />}
          </div>
          {hasRealData || isProspect ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard
                label="Cumplimiento mensual"
                value={`${s.compliance}%`}
                trend={<TrendBadge value={s.complianceTrend} suffix="%" />}
                color="emerald"
              />
              <KpiCard
                label="Rondas completadas"
                value={`${s.completedRounds}/${s.totalRounds}`}
                trend={<span className="text-[10px] text-zinc-500">este mes</span>}
                color="blue"
              />
              <KpiCard
                label="Trust Score"
                value={String(s.trustScore)}
                trend={<TrendBadge value={s.trustTrend} />}
                color={s.trustScore >= 80 ? "emerald" : s.trustScore >= 60 ? "blue" : "red"}
              />
              <KpiCard
                label="Atención"
                value={String(attentionCount)}
                trend={
                  <span className="text-[10px] text-zinc-500">
                    {(s.incompleteRounds ?? 0)} incompletas · {(s.missedRounds ?? 0)} no realizadas
                  </span>
                }
                color={attentionCount === 0 ? "emerald" : attentionCount <= 2 ? "amber" : "red"}
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 rounded-xl border border-white/5 bg-white/[0.01] text-zinc-500">
              <BarChart3 className="h-10 w-10 mb-3 opacity-40" />
              <p className="text-sm font-medium">Sin datos operacionales este mes</p>
              <p className="text-xs opacity-60 mt-1">Los datos aparecerán cuando se registren rondas</p>
            </div>
          )}
        </div>
      )}

      {/* Quick actions — clientes activos */}
      {!isProspect && (
        <div>
          <h3 className="text-sm font-semibold mb-3">Accesos rápidos</h3>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            {CLIENT_QUICK_ACTIONS.map((a) => {
              const Icon = a.icon;
              return (
                <button
                  key={a.section}
                  onClick={() => onNavigate(a.section)}
                  className="rounded-xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/20 transition-all active:scale-[0.98] flex flex-col items-center gap-1.5 py-3 px-2 text-center"
                >
                  <span className={cn("h-9 w-9 rounded-lg flex items-center justify-center", a.bg)}>
                    <Icon className={cn("h-4 w-4", a.color)} />
                  </span>
                  <span className="text-[11px] font-medium text-zinc-200 leading-tight">{a.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Gráfico de cumplimiento diario */}
      {(hasRealData || isProspect) && (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              Cumplimiento diario {compliance.isDemo && <PreviewBadge />}
            </h3>
            <div className="flex gap-1">
              {[7, 14, 30].map((d) => (
                <button
                  key={d}
                  onClick={() => setDaysRange(d)}
                  className={cn(
                    "px-2 py-0.5 rounded text-[10px] font-medium transition-colors",
                    daysRange === d
                      ? "bg-teal-600 text-white"
                      : "bg-white/5 text-zinc-400 hover:bg-white/10"
                  )}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>
          <div className="h-[160px] sm:h-[200px]">
            {chartData.length === 0 ? (
              <div className="flex items-center justify-center h-full text-xs text-zinc-500">
                Sin datos
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: "rgba(255,255,255,0.3)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 10, fill: "rgba(255,255,255,0.3)" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload as DailyPoint;
                      return (
                        <div className="rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 shadow-xl text-xs">
                          <p className="font-medium text-white mb-1">{label}</p>
                          <p className="text-zinc-400">
                            Cumplimiento:{" "}
                            <span className="text-white font-semibold">{d?.compliance ?? 0}%</span>
                          </p>
                          <p className="text-zinc-400">
                            {d?.completed ?? 0}/{d?.total ?? 0} completadas
                          </p>
                        </div>
                      );
                    }}
                    cursor={{ fill: "rgba(255,255,255,0.02)" }}
                  />
                  <Bar dataKey="compliance" radius={[3, 3, 0, 0]} maxBarSize={24}>
                    {chartData.map((e) => (
                      <Cell key={e.date} fill={barColor(e.compliance)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}

      {/* Widgets de equipo + tickets (cliente activo con datos) */}
      {!isProspect && s && (s.team || (s.openTickets ?? 0) > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {s.team && s.team.size > 0 && (
            <TeamCard team={s.team} onNavigate={onNavigate} />
          )}
          {(s.openTickets ?? 0) > 0 && (
            <TicketsCard count={s.openTickets!} onNavigate={onNavigate} />
          )}
        </div>
      )}

      {/* Actividad reciente */}
      {(activity.data?.length ?? 0) > 0 && (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-sm font-semibold">Actividad reciente</h3>
            {activity.isDemo && <PreviewBadge />}
            <OpaiBadge variant="live" className="ml-auto" />
          </div>
          <div className="space-y-2">
            {activity.data!.map((a) => {
              const Icon = ICON_COMPONENTS[a.icon] ?? Clock;
              const colorCls = ICON_COLORS[a.icon] ?? "text-zinc-400";
              return (
                <div
                  key={a.id}
                  className="flex items-start gap-3 py-1.5 border-b border-white/5 last:border-0"
                >
                  <span className="text-[10px] text-zinc-500 w-14 shrink-0 tabular-nums pt-0.5">
                    {formatActivityTimestamp(a.timestamp)}
                  </span>
                  <Icon className={cn("h-4 w-4 shrink-0 mt-0.5", colorCls)} />
                  <div className="min-w-0">
                    <p className="text-sm">{a.text}</p>
                    {a.detail && <p className="text-[10px] text-zinc-400 truncate">{a.detail}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Prospect-only: capabilities grid + CTA */}
      {isProspect && (
        <div>
          <h3 className="text-sm font-semibold mb-3">Lo que incluye tu servicio</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {PROSPECT_CAPABILITY_CARDS.map((card) => {
              const Icon = card.icon;
              return (
                <button
                  key={card.section + card.title}
                  onClick={() => onNavigate(card.section)}
                  className={cn(
                    "rounded-xl border p-4 text-left transition-all hover:scale-[1.01] active:scale-[0.99]",
                    card.border,
                    "bg-white/[0.02]"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", card.bg)}>
                      <Icon className={cn("w-5 h-5", card.color)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white mb-0.5">{card.title}</p>
                      <p className="text-xs text-zinc-400 leading-relaxed">{card.desc}</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-zinc-600 shrink-0 mt-1" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {isProspect && (
        <div
          className="rounded-2xl border border-white/[0.06] p-6 text-center"
          style={{ background: "linear-gradient(145deg, rgba(30,41,59,0.8), rgba(26,35,50,0.8))" }}
        >
          <h3 className="text-base font-bold text-white mb-2">¿Por qué ninguna otra empresa tiene esto?</h3>
          <p className="text-xs text-zinc-400 max-w-md mx-auto leading-relaxed mb-5">
            {branding.companyName} desarrolló su propia tecnología. No usamos software genérico. OPAI fue diseñado
            exclusivamente para seguridad privada.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => onNavigate("cotizaciones")}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold active:scale-[0.98]"
              style={{
                background: "linear-gradient(135deg, #0d9488, #14b8a6, #2dd4bf)",
                color: "#042f2e",
                boxShadow: "0 4px 20px rgba(45,212,191,0.3)",
              }}
            >
              Aprobar mi propuesta
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => onNavigate("chat")}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            >
              Hablar con mi ejecutivo
            </button>
            <WhatsAppButton variant="compact" />
          </div>
        </div>
      )}

      {/* Card del ejecutivo */}
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <h3 className="text-sm font-semibold mb-3">Tu ejecutivo</h3>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-teal-600/30 border border-teal-500/30 flex items-center justify-center">
            <span className="text-sm font-semibold text-teal-300">
              {session.ejecutivoName ? session.ejecutivoName.charAt(0).toUpperCase() : "G"}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">
              {session.ejecutivoName || `Equipo ${branding.companyName}`}
            </p>
            <p className="text-xs text-zinc-500">Ejecutivo asignado</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onNavigate("chat")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-teal-600/20 text-teal-400 hover:bg-teal-600/30"
            >
              <MessageSquare className="w-3.5 h-3.5" /> Chat
            </button>
            <WhatsAppButton variant="compact" />
          </div>
        </div>
      </div>

      {isLoading && !summary.data && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-teal-400" />
        </div>
      )}

      <footer className="text-center text-xs text-zinc-500 pt-4 pb-8 space-y-1">
        <p>
          {branding.companyName} · Plataforma <span className="font-medium text-zinc-400">OPAI</span> · Desarrollado
          por{" "}
          <a
            href="https://lx3.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-zinc-300"
          >
            LX3.ai
          </a>
        </p>
      </footer>
    </div>
  );
}

/* ── Sub-widgets ──────────────────────────────────────────────────── */

function RondaEnCursoHero({
  rondaEnCurso,
  onNavigate,
}: {
  rondaEnCurso: NonNullable<Summary["rondaEnCurso"]>;
  onNavigate: (s: string) => void;
}) {
  const pct = Math.max(0, Math.min(100, rondaEnCurso.porcentaje));
  return (
    <button
      onClick={() => onNavigate("rondas")}
      className={cn(
        "w-full rounded-2xl border p-4 text-left transition-colors active:scale-[0.99]",
        "border-amber-500/30 bg-amber-500/5",
      )}
      aria-label="Ronda en curso"
    >
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-amber-500/10 relative">
          <span className="absolute inset-0 rounded-xl bg-amber-400/30 animate-ping" aria-hidden />
          <MapPin className="h-5 w-5 text-amber-300 relative" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-300">
            EN CURSO AHORA
          </p>
          <p className="text-sm font-medium text-white leading-tight">
            Ronda en ejecución · {rondaEnCurso.checkpointsCompletados}/{rondaEnCurso.checkpointsTotal} checkpoints
          </p>
          <p className="text-[11px] text-zinc-400 mt-0.5">
            {rondaEnCurso.guardiaName ?? "Guardia"}
            {rondaEnCurso.startedAt
              ? ` · inició ${timeAgo(rondaEnCurso.startedAt)}`
              : ""}
          </p>
        </div>
        <ArrowRight className="h-4 w-4 text-zinc-400 shrink-0" />
      </div>
      <div className="mt-3">
        <div className="h-1 bg-black/30 rounded-full overflow-hidden">
          <div
            className="h-full bg-amber-400 rounded-full transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </button>
  );
}

function ServiceStatusHero({
  lastRound,
  attentionCount,
  onNavigate,
}: {
  lastRound: NonNullable<Summary["lastRound"]>;
  attentionCount: number;
  onNavigate: (s: string) => void;
}) {
  // Copy pensado para el cliente (no para el equipo de monitoreo).
  // El cliente no puede "resolver" nada, así que evitamos lenguaje de
  // alerta operativa ("Requiere atención") y usamos frases descriptivas.
  const positive =
    lastRound.status === "completada" && attentionCount === 0;
  const warning =
    lastRound.status === "incompleta" ||
    (attentionCount > 0 && attentionCount <= 2);
  const bad = lastRound.status === "no_realizada" || attentionCount > 2;

  const tone = bad
    ? {
        border: "border-red-500/25",
        bg: "bg-red-500/5",
        icon: XCircle,
        color: "text-red-400",
        label: "Rondas con pendientes",
      }
    : warning
      ? {
          border: "border-amber-500/25",
          bg: "bg-amber-500/5",
          icon: AlertTriangle,
          color: "text-amber-400",
          label: "Con observaciones",
        }
      : {
          border: "border-emerald-500/25",
          bg: "bg-emerald-500/5",
          icon: CheckCircle2,
          color: "text-emerald-400",
          label: "Servicio operando",
        };

  const Icon = tone.icon;
  const statusText =
    lastRound.status === "completada"
      ? "Última ronda completada"
      : lastRound.status === "incompleta"
        ? `Última ronda parcial (${lastRound.porcentaje}%)`
        : "Última ronda no realizada";

  return (
    <button
      onClick={() => onNavigate("rondas")}
      className={cn(
        "w-full rounded-2xl border p-4 text-left transition-colors active:scale-[0.99]",
        tone.border,
        tone.bg,
      )}
      aria-label={tone.label}
      data-positive={positive}
    >
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-white/[0.04]">
          <Icon className={cn("h-5 w-5", tone.color)} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn("text-[11px] font-semibold uppercase tracking-wider", tone.color)}>
            {tone.label}
          </p>
          <p className="text-sm font-medium text-white leading-tight">{statusText}</p>
          <p className="text-[11px] text-zinc-400 mt-0.5">
            {timeAgo(lastRound.timestamp)}
            {lastRound.guardiaName ? ` · ${lastRound.guardiaName}` : ""}
          </p>
        </div>
        <ArrowRight className="h-4 w-4 text-zinc-500 shrink-0" />
      </div>
    </button>
  );
}

function TeamCard({
  team,
  onNavigate,
}: {
  team: NonNullable<Summary["team"]>;
  onNavigate: (s: string) => void;
}) {
  const warn = team.os10PorVencer > 0;
  const bad = team.os10Vencido > 0;
  const tone = bad
    ? "border-red-500/20 bg-red-500/[0.02]"
    : warn
    ? "border-amber-500/20 bg-amber-500/[0.02]"
    : "border-emerald-500/20 bg-emerald-500/[0.02]";
  return (
    <button
      onClick={() => onNavigate("instalacion-detalle")}
      className={cn(
        "rounded-xl border p-4 text-left transition-colors active:scale-[0.99]",
        tone
      )}
    >
      <div className="flex items-center gap-2 mb-3">
        <UserCheck className="h-4 w-4 text-teal-400" />
        <p className="text-sm font-semibold text-white">Equipo asignado</p>
        <ArrowRight className="h-3.5 w-3.5 text-zinc-500 ml-auto" />
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-lg font-bold text-white tabular-nums">{team.size}</p>
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Guardias</p>
        </div>
        <div>
          <p className="text-lg font-bold text-emerald-400 tabular-nums">{team.os10Vigente}</p>
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider">OS-10 OK</p>
        </div>
        <div>
          <p
            className={cn(
              "text-lg font-bold tabular-nums",
              bad ? "text-red-400" : warn ? "text-amber-400" : "text-zinc-500"
            )}
          >
            {team.os10PorVencer + team.os10Vencido}
          </p>
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Atención</p>
        </div>
      </div>
    </button>
  );
}

function TicketsCard({
  count,
  onNavigate,
}: {
  count: number;
  onNavigate: (s: string) => void;
}) {
  return (
    <button
      onClick={() => onNavigate("tickets")}
      className="rounded-xl border border-blue-500/20 bg-blue-500/[0.02] p-4 text-left transition-colors active:scale-[0.99]"
    >
      <div className="flex items-center gap-2 mb-3">
        <Ticket className="h-4 w-4 text-blue-400" />
        <p className="text-sm font-semibold text-white">Tickets abiertos</p>
        <ArrowRight className="h-3.5 w-3.5 text-zinc-500 ml-auto" />
      </div>
      <div className="flex items-center gap-3">
        <p className="text-3xl font-bold text-white tabular-nums">{count}</p>
        <p className="text-xs text-zinc-400 leading-tight">
          {count === 1 ? "ticket abierto" : "tickets abiertos"} en seguimiento
        </p>
      </div>
    </button>
  );
}
