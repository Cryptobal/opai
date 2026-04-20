"use client";

import { useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import {
  TrendingUp, TrendingDown, Minus, CheckCircle2, AlertTriangle, XCircle,
  Clock, Loader2, BarChart3, MapPin, Star, FileText, Bot, ShieldCheck,
  MessageSquare, ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useBranding } from "@/lib/branding/useBranding";
import { usePortalSession } from "@/contexts/portal-cliente-session-context";
import { usePortalData } from "@/hooks/usePortalData";
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
  alerts: number;
  alertsTrend: number;
}
interface DailyPoint { date: string; compliance: number; total: number; completed: number }
interface Guard { name: string; rounds: number; trustAvg: number }
interface Activity { id: string; type: string; timestamp: string; icon: string; text: string; detail?: string }

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
const MEDALS = ["🥇", "🥈", "🥉"];

const PROSPECT_CAPABILITY_CARDS = [
  { icon: MapPin, title: "Rondas GPS en vivo", desc: "Ve dónde está tu guardia con verificación por geofencing", section: "rondas", color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/15" },
  { icon: Star, title: "Trust Score", desc: "Guardias evaluados con datos reales: asistencia, rondas, capacitación", section: "desempeno", color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/15" },
  { icon: FileText, title: "Documentación digital", desc: "Contratos, OS-10, antecedentes — todo en un click", section: "documentacion", color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/15" },
  { icon: Bot, title: "IA predictiva", desc: "Protocolos y análisis automáticos con inteligencia artificial", section: "desempeno", color: "text-violet-400", bg: "bg-violet-500/10", border: "border-violet-500/15" },
  { icon: ShieldCheck, title: "Control de acceso", desc: "QR, lectura de cédula, registro digital en tiempo real", section: "control-acceso", color: "text-sky-400", bg: "bg-sky-500/10", border: "border-sky-500/15" },
  { icon: MessageSquare, title: "Chat directo", desc: "Habla con tu equipo 24/7 sin salir del portal", section: "chat", color: "text-teal-400", bg: "bg-teal-500/10", border: "border-teal-500/15" },
];

function TrendBadge({ value, suffix = "" }: { value: number; suffix?: string }) {
  if (value > 0) return <span className="text-emerald-400 text-[10px] flex items-center gap-0.5"><TrendingUp className="h-3 w-3" /> +{value}{suffix}</span>;
  if (value < 0) return <span className="text-red-400 text-[10px] flex items-center gap-0.5"><TrendingDown className="h-3 w-3" /> {value}{suffix}</span>;
  return <span className="text-zinc-500 text-[10px] flex items-center gap-0.5"><Minus className="h-3 w-3" /> 0{suffix}</span>;
}

function KpiCard({ label, value, trend, color }: { label: string; value: string; trend: React.ReactNode; color: string }) {
  const borderCls =
    color === "emerald" ? "border-emerald-500/20" :
    color === "blue" ? "border-blue-500/20" :
    color === "red" ? "border-red-500/20" : "border-white/10";
  return (
    <div className={cn("rounded-xl border bg-white/[0.02] p-3", borderCls)}>
      <p className="text-[10px] text-zinc-400 uppercase tracking-wider mb-1">{label}</p>
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

interface Props {
  selectedInstallation: string;
  onNavigate: (section: string) => void;
}

export function PortalDashboard({ selectedInstallation, onNavigate }: Props) {
  const { session } = usePortalSession();
  const { branding } = useBranding();
  const [daysRange, setDaysRange] = useState(30);

  const baseParams = selectedInstallation ? { installationId: selectedInstallation } : undefined;
  // Skip dashboard fetches until an installation is selected — the four
  // endpoints below 403 without `installationId`. Without `skip` the user
  // sees a flash of red errors in the network tab while the shell decides
  // which installation to default to.
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
  const guards = usePortalData<Guard[]>({
    endpoint: "/api/portal/cliente/guards",
    demoKey: "dashboard_guards",
    params: baseParams,
    skip: skipDashboard,
  });
  const activity = usePortalData<Activity[]>({
    endpoint: "/api/portal/cliente/activity",
    demoKey: "dashboard_activity",
    params: baseParams,
    skip: skipDashboard,
  });

  const isProspect = !!session?.isProspect;
  const isLoading = summary.loading || compliance.loading || guards.loading || activity.loading;

  const instName = useMemo(
    () => session?.installations.find((i) => i.id === selectedInstallation)?.name ?? "",
    [session?.installations, selectedInstallation],
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
    [compliance.data, daysRange],
  );

  if (!session) return null;

  const hasRealData = summary.data && summary.data.totalRounds > 0;

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

      <DashboardCotizacionesPendientes
        isProspect={isProspect}
        onNavigateToDetail={(section) => onNavigate(section)}
      />

      {summary.data && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">Métricas de servicio</h3>
            {summary.isDemo && <PreviewBadge />}
          </div>
          {hasRealData || isProspect ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              <KpiCard label="Cumplimiento mensual" value={`${summary.data.compliance}%`} trend={<TrendBadge value={summary.data.complianceTrend} suffix="%" />} color="emerald" />
              <KpiCard label="Rondas completadas" value={`${summary.data.completedRounds}/${summary.data.totalRounds}`} trend={<span className="text-[10px] text-zinc-500">este mes</span>} color="blue" />
              <KpiCard label="Trust Score" value={String(summary.data.trustScore)} trend={<TrendBadge value={summary.data.trustTrend} />} color={summary.data.trustScore >= 80 ? "emerald" : summary.data.trustScore >= 60 ? "blue" : "red"} />
              <KpiCard label="Alertas del mes" value={String(summary.data.alerts)} trend={<TrendBadge value={-summary.data.alertsTrend} />} color={summary.data.alerts > 5 ? "red" : "emerald"} />
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

      {(hasRealData || isProspect) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 rounded-xl border border-white/10 bg-white/[0.02] p-4">
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
                      daysRange === d ? "bg-teal-600 text-white" : "bg-white/5 text-zinc-400 hover:bg-white/10",
                    )}
                  >
                    {d}d
                  </button>
                ))}
              </div>
            </div>
            <div className="h-[160px] sm:h-[200px]">
              {chartData.length === 0 ? (
                <div className="flex items-center justify-center h-full text-xs text-zinc-500">Sin datos</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.3)" }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "rgba(255,255,255,0.3)" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload as DailyPoint;
                        return (
                          <div className="rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 shadow-xl text-xs">
                            <p className="font-medium text-white mb-1">{label}</p>
                            <p className="text-zinc-400">Cumplimiento: <span className="text-white font-semibold">{d?.compliance ?? 0}%</span></p>
                            <p className="text-zinc-400">{d?.completed ?? 0}/{d?.total ?? 0} completadas</p>
                          </div>
                        );
                      }}
                      cursor={{ fill: "rgba(255,255,255,0.02)" }}
                    />
                    <Bar dataKey="compliance" radius={[3, 3, 0, 0]} maxBarSize={24}>
                      {chartData.map((e) => <Cell key={e.date} fill={barColor(e.compliance)} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-sm font-semibold">Top guardias</h3>
              <OpaiBadge text="Trust Score" variant="default" className="hidden sm:inline-flex" />
              {guards.isDemo && <PreviewBadge />}
            </div>
            {(!guards.data || guards.data.length === 0) ? (
              <p className="text-xs text-zinc-500 py-4 text-center">Sin datos</p>
            ) : (
              <div className="space-y-3">
                {guards.data.map((g, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-lg">{MEDALS[i] ?? "•"}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{g.name}</p>
                      <p className="text-[10px] text-zinc-400">{g.rounds} rondas · Trust {g.trustAvg}</p>
                    </div>
                    <span
                      className={cn(
                        "text-sm font-bold tabular-nums",
                        g.trustAvg >= 80 ? "text-emerald-400" : g.trustAvg >= 60 ? "text-amber-400" : "text-red-400",
                      )}
                    >
                      {g.trustAvg}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {(activity.data?.length ?? 0) > 0 && (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-sm font-semibold">Actividad reciente</h3>
            {activity.isDemo && <PreviewBadge />}
          </div>
          <div className="space-y-2">
            {activity.data!.map((a) => {
              const Icon = ICON_COMPONENTS[a.icon] ?? Clock;
              const colorCls = ICON_COLORS[a.icon] ?? "text-zinc-400";
              return (
                <div key={a.id} className="flex items-start gap-3 py-1.5 border-b border-white/5 last:border-0">
                  <span className="text-[10px] text-zinc-500 w-12 shrink-0 tabular-nums pt-0.5">
                    {new Date(a.timestamp).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
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
                    "bg-white/[0.02]",
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

      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <h3 className="text-sm font-semibold mb-3">Tu ejecutivo</h3>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-teal-600/30 border border-teal-500/30 flex items-center justify-center">
            <span className="text-sm font-semibold text-teal-300">
              {session.ejecutivoName ? session.ejecutivoName.charAt(0).toUpperCase() : "G"}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">{session.ejecutivoName || `Equipo ${branding.companyName}`}</p>
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
          {branding.companyName} · Plataforma <span className="font-medium text-zinc-400">OPAI</span> · Desarrollado por{" "}
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
