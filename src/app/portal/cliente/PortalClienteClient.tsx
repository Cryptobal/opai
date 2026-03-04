"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PWAInstallBanner } from "@/components/pwa/PWAInstallBanner";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import {
  Shield, TrendingUp, TrendingDown, Minus, CheckCircle2, AlertTriangle, XCircle,
  Clock, Download, Loader2, LogOut, ChevronDown, MessageCircle, FileText,
} from "lucide-react";
import { ChatClienteSection } from "@/components/portales/ChatClienteSection";
import { PortalContractsSection } from "@/components/portales/PortalContractsSection";
import { cn } from "@/lib/utils";

/* ── Types ── */

interface ClienteSession {
  contactId: string;
  tenantId: string;
  accountId: string;
  accountName: string;
  firstName: string;
  lastName?: string;
  installations: Array<{ id: string; name: string }>;
}

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

/* ── Helpers ── */

function formatRut(v: string): string {
  const clean = v.replace(/[^0-9kK]/g, "").toUpperCase();
  if (clean.length <= 1) return clean;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  const formatted = body.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${formatted}-${dv}`;
}

function barColor(pct: number): string {
  if (pct >= 90) return "#22c55e";
  if (pct >= 70) return "#3b82f6";
  return "#f59e0b";
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

function TrendBadge({ value, suffix = "" }: { value: number; suffix?: string }) {
  if (value > 0) return <span className="text-emerald-400 text-[10px] flex items-center gap-0.5"><TrendingUp className="h-3 w-3" /> +{value}{suffix}</span>;
  if (value < 0) return <span className="text-red-400 text-[10px] flex items-center gap-0.5"><TrendingDown className="h-3 w-3" /> {value}{suffix}</span>;
  return <span className="text-zinc-500 text-[10px] flex items-center gap-0.5"><Minus className="h-3 w-3" /> 0{suffix}</span>;
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ payload?: DailyPoint }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 shadow-xl text-xs">
      <p className="font-medium text-white mb-1">{label}</p>
      <p className="text-zinc-400">Cumplimiento: <span className="text-white font-semibold">{d?.compliance ?? 0}%</span></p>
      <p className="text-zinc-400">{d?.completed ?? 0}/{d?.total ?? 0} completadas</p>
    </div>
  );
}

const MEDALS = ["🥇", "🥈", "🥉"];

/* ══════════════════════════════════════════════════════ */

export function PortalClienteClient() {
  const [session, setSession] = useState<ClienteSession | null>(null);
  const [screen, setScreen] = useState<"login" | "dashboard">("login");
  const [activeTab, setActiveTab] = useState<"dashboard" | "chat" | "contratos">("dashboard");

  /* ── Login state ── */
  const [rut, setRut] = useState("");
  const [pin, setPin] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  /* ── Dashboard state ── */
  const [installationId, setInstallationId] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [compliance, setCompliance] = useState<DailyPoint[]>([]);
  const [guards, setGuards] = useState<Guard[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [daysRange, setDaysRange] = useState(30);
  const [loadingData, setLoadingData] = useState(false);

  /* ── Login ── */
  async function handleLogin() {
    setLoginError("");
    setLoggingIn(true);
    try {
      const res = await fetch("/api/portal/cliente/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rut: rut.replace(/[.\-]/g, ""), pin }),
      });
      const json = await res.json();
      if (json.success) {
        setSession(json.data);
        setInstallationId(json.data.installations[0]?.id ?? "");
        setScreen("dashboard");
      } else {
        setLoginError(json.error || "Error de autenticación");
      }
    } catch {
      setLoginError("Error de conexión");
    } finally {
      setLoggingIn(false);
    }
  }

  /* ── Fetch dashboard data ── */
  const fetchDashboard = useCallback(async (instId: string, tenantId: string) => {
    if (!instId) return;
    setLoadingData(true);
    try {
      const params = `installationId=${encodeURIComponent(instId)}&tenantId=${encodeURIComponent(tenantId)}`;
      const [sumRes, compRes, guardRes, actRes] = await Promise.all([
        fetch(`/api/portal/cliente/summary?${params}`),
        fetch(`/api/portal/cliente/compliance?${params}&days=${daysRange}`),
        fetch(`/api/portal/cliente/guards?${params}`),
        fetch(`/api/portal/cliente/activity?${params}`),
      ]);
      const [sumJ, compJ, guardJ, actJ] = await Promise.all([sumRes.json(), compRes.json(), guardRes.json(), actRes.json()]);
      if (sumJ.success) setSummary(sumJ.data);
      if (compJ.success) setCompliance(compJ.data);
      if (guardJ.success) setGuards(guardJ.data);
      if (actJ.success) setActivity(actJ.data);
    } catch { /* silent */ } finally {
      setLoadingData(false);
    }
  }, [daysRange]);

  useEffect(() => {
    if (session && installationId) {
      void fetchDashboard(installationId, session.tenantId);
    }
  }, [session, installationId, fetchDashboard]);

  const instName = useMemo(
    () => session?.installations.find((i) => i.id === installationId)?.name ?? "",
    [session, installationId],
  );

  const chartData = useMemo(
    () => compliance.slice(-daysRange).map((d) => ({
      ...d,
      label: new Date(d.date + "T12:00:00").toLocaleDateString("es-CL", { day: "2-digit", month: "short" }),
    })),
    [compliance, daysRange],
  );

  /* ══════════════════════════════════════ LOGIN ══════════════════════════════════════ */
  if (screen === "login") {
    return (
      <div className="min-h-dvh flex items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 mb-4">
              <Shield className="h-8 w-8 text-teal-400" />
              <span className="text-xl font-bold tracking-tight">Gard Security</span>
            </div>
            <h1 className="text-lg font-semibold">Portal de Seguridad</h1>
            <p className="text-sm text-zinc-400 mt-1">Ingrese con el RUT de su empresa y el PIN proporcionado</p>
          </div>

          <PWAInstallBanner
            appName="OPAI Clientes"
            appDescription="Tu portal de seguridad siempre disponible"
            iconSrc="/iconos_azul/icon-192x192.png"
            variant="inline"
            dismissKey="cliente"
          />

          <div className="space-y-3">
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">RUT Empresa</label>
              <input
                type="text"
                value={rut}
                onChange={(e) => setRut(formatRut(e.target.value))}
                placeholder="12.345.678-9"
                maxLength={12}
                className="w-full h-11 rounded-lg border border-white/10 bg-white/5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                onKeyDown={(e) => e.key === "Enter" && document.getElementById("pin-input")?.focus()}
              />
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">PIN</label>
              <input
                id="pin-input"
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="••••"
                maxLength={6}
                inputMode="numeric"
                className="w-full h-11 rounded-lg border border-white/10 bg-white/5 px-3 text-sm tracking-[0.3em] text-center focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              />
            </div>
            {loginError && <p className="text-xs text-red-400 text-center">{loginError}</p>}
            <button
              onClick={handleLogin}
              disabled={loggingIn || !rut || !pin}
              className="w-full h-11 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-40 text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              {loggingIn ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
              Ingresar al portal
            </button>
          </div>

          <p className="text-[10px] text-zinc-600 text-center">
            Powered by Gard Security · Portal de cumplimiento
          </p>
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════ DASHBOARD ══════════════════════════════════════ */
  return (
    <div className="min-h-dvh flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/50">
        <div className="flex items-center gap-3">
          <Shield className="h-6 w-6 text-teal-400" />
          <div>
            <h1 className="text-base font-semibold">Portal de Seguridad</h1>
            <p className="text-xs text-zinc-400">{session?.accountName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {session && session.installations.length > 1 && activeTab === "dashboard" && (
            <div className="relative">
              <select
                value={installationId}
                onChange={(e) => setInstallationId(e.target.value)}
                className="h-8 rounded border border-white/10 bg-white/5 px-2 pr-7 text-xs appearance-none"
              >
                {session.installations.map((i) => (
                  <option key={i.id} value={i.id}>{i.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-2 h-3.5 w-3.5 pointer-events-none text-zinc-400" />
            </div>
          )}
          <button onClick={() => { setSession(null); setScreen("login"); setActiveTab("dashboard"); }} className="p-2 rounded hover:bg-white/5 transition-colors">
            <LogOut className="h-4 w-4 text-zinc-400" />
          </button>
        </div>
      </header>

      {/* Tab bar */}
      <div className="flex border-b border-zinc-800/50 bg-zinc-900/30">
        <button
          onClick={() => setActiveTab("dashboard")}
          className={cn("flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-medium transition-colors border-b-2",
            activeTab === "dashboard" ? "border-teal-500 text-teal-400" : "border-transparent text-zinc-500 hover:text-zinc-300")}
        >
          <Shield className="h-4 w-4" />
          Dashboard
        </button>
        <button
          onClick={() => setActiveTab("contratos")}
          className={cn("flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-medium transition-colors border-b-2",
            activeTab === "contratos" ? "border-teal-500 text-teal-400" : "border-transparent text-zinc-500 hover:text-zinc-300")}
        >
          <FileText className="h-4 w-4" />
          Contratos
        </button>
        <button
          onClick={() => setActiveTab("chat")}
          className={cn("flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-medium transition-colors border-b-2",
            activeTab === "chat" ? "border-teal-500 text-teal-400" : "border-transparent text-zinc-500 hover:text-zinc-300")}
        >
          <MessageCircle className="h-4 w-4" />
          Chat
        </button>
      </div>

      {/* Chat tab */}
      {activeTab === "chat" && session && (
        <div className="flex-1">
          <ChatClienteSection session={session} />
        </div>
      )}

      {/* Contratos tab */}
      {activeTab === "contratos" && session && (
        <div className="flex-1 max-w-6xl mx-auto w-full px-4 py-4 sm:py-6">
          <PortalContractsSection tenantId={session.tenantId} accountId={session.accountId} />
        </div>
      )}

      {/* Dashboard tab */}
      {activeTab === "dashboard" && (
        <div className="flex-1 max-w-6xl mx-auto w-full px-4 py-4 sm:py-6">
      {installationId && instName && (
        <p className="text-sm text-zinc-300 mb-4 font-medium">{instName}</p>
      )}

      {loadingData && !summary && (
        <div className="flex items-center justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-teal-400" /></div>
      )}

      {summary && (
        <div className="space-y-4">
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard label="Cumplimiento mensual" value={`${summary.compliance}%`} trend={<TrendBadge value={summary.complianceTrend} suffix="%" />} color="emerald" />
            <KpiCard label="Rondas completadas" value={`${summary.completedRounds}/${summary.totalRounds}`} trend={<span className="text-[10px] text-zinc-500">este mes</span>} color="blue" />
            <KpiCard label="Trust Score promedio" value={String(summary.trustScore)} trend={<TrendBadge value={summary.trustTrend} />} color="blue" />
            <KpiCard label="Alertas del mes" value={String(summary.alerts)} trend={<TrendBadge value={-summary.alertsTrend} />} color={summary.alerts > 5 ? "red" : "emerald"} />
          </div>

          {/* Chart + Guards */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">Cumplimiento diario</h3>
                <div className="flex gap-1">
                  {[7, 14, 30].map((d) => (
                    <button
                      key={d}
                      onClick={() => setDaysRange(d)}
                      className={cn("px-2 py-0.5 rounded text-[10px] font-medium transition-colors",
                        daysRange === d ? "bg-teal-600 text-white" : "bg-white/5 text-zinc-400 hover:bg-white/10")}
                    >
                      {d}d
                    </button>
                  ))}
                </div>
              </div>
              <div className="h-[200px]">
                {chartData.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-xs text-zinc-500">Sin datos</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.3)" }} axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "rgba(255,255,255,0.3)" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v}%`} />
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.02)" }} />
                      <Bar dataKey="compliance" radius={[3, 3, 0, 0]} maxBarSize={24}>
                        {chartData.map((e) => <Cell key={e.date} fill={barColor(e.compliance)} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <h3 className="text-sm font-semibold mb-3">Mejores guardias del mes</h3>
              {guards.length === 0 ? (
                <p className="text-xs text-zinc-500 py-4 text-center">Sin datos</p>
              ) : (
                <div className="space-y-3">
                  {guards.map((g, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-lg">{MEDALS[i] ?? "•"}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{g.name}</p>
                        <p className="text-[10px] text-zinc-400">{g.rounds} rondas · Trust {g.trustAvg}</p>
                      </div>
                      <span className={cn("text-sm font-bold tabular-nums",
                        g.trustAvg >= 85 ? "text-emerald-400" : g.trustAvg >= 70 ? "text-blue-400" : "text-amber-400"
                      )}>
                        {g.trustAvg}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Activity */}
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <h3 className="text-sm font-semibold mb-3">Actividad reciente</h3>
            {activity.length === 0 ? (
              <p className="text-xs text-zinc-500 py-4 text-center">Sin actividad reciente</p>
            ) : (
              <div className="space-y-2">
                {activity.map((a) => {
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
            )}
          </div>

          {/* Footer */}
          <footer className="text-center text-[10px] text-zinc-600 pt-4 pb-8">
            Powered by Gard Security · Última actualización: {new Date().toLocaleString("es-CL")}
          </footer>
        </div>
      )}
        </div>
      )}
    </div>
  );
}

/* ── KPI Card ── */
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
