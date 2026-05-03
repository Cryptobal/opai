"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  AlertCircle,
  AlertTriangle,
  Clock,
  Loader2,
  TrendingUp,
  UserX,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TICKET_TEAM_CONFIG, TICKET_PRIORITY_CONFIG } from "@/lib/tickets";

// ═══════════════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════════════

interface DashboardData {
  kpis: {
    openCount: number;
    breachedCount: number;
    p1PendingCount: number;
    unassignedCount: number;
    avgResolutionHours: number;
    resolvedThisWeek: number;
    createdThisWeek: number;
    resolutionRate: number;
  };
  teamData: Array<{ team: string; count: number }>;
  weeklyTrend: Array<{ week: string; created: number; resolved: number }>;
  slaByPriority: Array<{ priority: string; total: number; compliant: number; percentage: number }>;
  urgentItems: Array<{
    id: string;
    code: string;
    title: string;
    priority: string;
    status: string;
    reason: string;
    slaBreached: boolean;
    unassigned: boolean;
  }>;
  mttrByPriority: Array<{ priority: string; avgHours: number; sample: number }>;
  avgFirstResponseHours: number;
  firstResponseSample: number;
  reopenRate: number;
  reopenSample: number;
  myStats: { active: number; breached: number };
  heatmap: number[][]; // 7 días × 24 horas
  heatmapMax: number;
}

type Period = "today" | "week" | "month" | "quarter";

// ═══════════════════════════════════════════════════════════════
//  DASHBOARD COMPONENT
// ═══════════════════════════════════════════════════════════════

export function TicketsDashboard() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("week");

  useEffect(() => {
    async function fetchDashboard() {
      setLoading(true);
      try {
        const res = await fetch(`/api/ops/tickets/dashboard?period=${period}`);
        const json = await res.json();
        if (json.success) setData(json.data);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    fetchDashboard();
  }, [period]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        No se pudieron cargar los datos del dashboard
      </div>
    );
  }

  const {
    kpis,
    teamData,
    weeklyTrend,
    slaByPriority,
    urgentItems,
    mttrByPriority,
    avgFirstResponseHours,
    firstResponseSample,
    reopenRate,
    reopenSample,
    myStats,
    heatmap,
    heatmapMax,
  } = data;

  return (
    <div className="space-y-4">
      {/* Period selector */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {([
          { value: "today" as const, label: "Hoy" },
          { value: "week" as const, label: "Esta semana" },
          { value: "month" as const, label: "Este mes" },
          { value: "quarter" as const, label: "3 meses" },
        ]).map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => setPeriod(p.value)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              period === p.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard
          label="Abiertos"
          value={kpis.openCount}
          icon={<AlertCircle className="h-4 w-4" />}
          variant={kpis.openCount > 0 ? "amber" : "default"}
        />
        <KpiCard
          label="SLA vencidos"
          value={kpis.breachedCount}
          icon={<AlertTriangle className="h-4 w-4" />}
          variant={kpis.breachedCount > 0 ? "red" : "default"}
          alert={kpis.breachedCount > 0}
        />
        <KpiCard
          label="P1 pendientes"
          value={kpis.p1PendingCount}
          icon={<Zap className="h-4 w-4" />}
          variant={kpis.p1PendingCount > 0 ? "red" : "default"}
        />
        <KpiCard
          label="Resol. promedio"
          value={`${kpis.avgResolutionHours}h`}
          icon={<Clock className="h-4 w-4" />}
          variant="default"
        />
        <KpiCard
          label="Tasa resolución"
          value={`${kpis.resolutionRate}%`}
          icon={<TrendingUp className="h-4 w-4" />}
          variant={kpis.resolutionRate >= 80 ? "emerald" : "amber"}
          subtitle="esta semana"
        />
      </div>

      {/* KPI Cards — fila 2: KPIs avanzados (MTTR / first-response /
          reaperturas / mis tickets) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Mis tickets activos"
          value={myStats.active}
          icon={<UserX className="h-4 w-4" />}
          variant={myStats.breached > 0 ? "red" : myStats.active > 0 ? "amber" : "default"}
          subtitle={
            myStats.breached > 0
              ? `${myStats.breached} con SLA vencido`
              : myStats.active === 0
                ? "Sin pendientes"
                : "Sin SLA vencido"
          }
        />
        <KpiCard
          label="1ª respuesta promedio"
          value={
            firstResponseSample > 0 ? `${avgFirstResponseHours}h` : "—"
          }
          icon={<Clock className="h-4 w-4" />}
          variant={
            firstResponseSample === 0
              ? "default"
              : avgFirstResponseHours <= 2
                ? "emerald"
                : avgFirstResponseHours <= 8
                  ? "amber"
                  : "red"
          }
          subtitle={
            firstResponseSample > 0
              ? `${firstResponseSample} tickets`
              : "Sin datos en el periodo"
          }
        />
        <KpiCard
          label="Reaperturas"
          value={`${reopenRate}%`}
          icon={<TrendingUp className="h-4 w-4" />}
          variant={
            reopenSample === 0
              ? "default"
              : reopenRate <= 5
                ? "emerald"
                : reopenRate <= 15
                  ? "amber"
                  : "red"
          }
          subtitle={
            reopenSample > 0
              ? `${reopenSample} resueltos en periodo`
              : "Sin datos"
          }
        />
        <KpiCard
          label="MTTR P1"
          value={
            (mttrByPriority.find((m) => m.priority === "p1")?.sample ?? 0) > 0
              ? `${mttrByPriority.find((m) => m.priority === "p1")?.avgHours ?? 0}h`
              : "—"
          }
          icon={<Zap className="h-4 w-4" />}
          variant="default"
          subtitle={
            (mttrByPriority.find((m) => m.priority === "p1")?.sample ?? 0) > 0
              ? `${mttrByPriority.find((m) => m.priority === "p1")?.sample} tickets`
              : "Sin P1 cerrados"
          }
        />
      </div>

      {/* MTTR por prioridad (barras horizontales propias) */}
      {mttrByPriority.some((m) => m.sample > 0) && (
        <DashboardCard title="MTTR por prioridad">
          <div className="space-y-2">
            {mttrByPriority.map((m) => {
              const cfg =
                TICKET_PRIORITY_CONFIG[
                  m.priority as keyof typeof TICKET_PRIORITY_CONFIG
                ];
              return (
                <div key={m.priority} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className={cfg?.color ?? "text-muted-foreground"}>
                      {m.priority.toUpperCase()}
                    </span>
                    <span className="text-muted-foreground">
                      {m.sample > 0 ? `${m.avgHours}h promedio` : "Sin datos"}
                      {m.sample > 0 && (
                        <span className="ml-1 text-[12px]">
                          ({m.sample})
                        </span>
                      )}
                    </span>
                  </div>
                  {m.sample > 0 && (
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{
                          width: `${Math.min(
                            100,
                            (m.avgHours /
                              Math.max(
                                ...mttrByPriority.map((x) => x.avgHours),
                                1,
                              )) *
                              100,
                          )}%`,
                        }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </DashboardCard>
      )}

      {/* Heatmap horario (días × horas) */}
      {heatmapMax > 0 && (
        <DashboardCard title="Volumen por día y hora (creación)">
          <TicketsHeatmap heatmap={heatmap} max={heatmapMax} />
        </DashboardCard>
      )}

      {/* Tickets by team (horizontal bars) */}
      {teamData.length > 0 && (
        <DashboardCard title="Por equipo">
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={teamData} layout="vertical" margin={{ left: 0, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#30363d" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: "#8b949e" }} />
                <YAxis
                  type="category"
                  dataKey="team"
                  width={90}
                  tick={{ fontSize: 11, fill: "#8b949e" }}
                  tickFormatter={(t: string) =>
                    (TICKET_TEAM_CONFIG as Record<string, { label: string }>)[t]?.label ?? t
                  }
                />
                <Tooltip
                  contentStyle={{
                    background: "#161b22",
                    border: "1px solid #30363d",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  labelFormatter={(t) =>
                    (TICKET_TEAM_CONFIG as Record<string, { label: string }>)[String(t)]?.label ?? String(t)
                  }
                />
                <Bar dataKey="count" fill="#10b981" radius={[0, 4, 4, 0]} name="Tickets" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </DashboardCard>
      )}

      {/* Weekly trend (line chart) */}
      {weeklyTrend.length > 0 && (
        <DashboardCard title="Tendencia semanal">
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={weeklyTrend} margin={{ left: 0, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
                <XAxis dataKey="week" tick={{ fontSize: 11, fill: "#8b949e" }} />
                <YAxis tick={{ fontSize: 11, fill: "#8b949e" }} />
                <Tooltip
                  contentStyle={{
                    background: "#161b22",
                    border: "1px solid #30363d",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "11px" }} />
                <Line
                  type="monotone"
                  dataKey="created"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  name="Creados"
                />
                <Line
                  type="monotone"
                  dataKey="resolved"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  name="Resueltos"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </DashboardCard>
      )}

      {/* SLA compliance by priority */}
      <DashboardCard title="SLA por prioridad">
        <div className="space-y-3">
          {slaByPriority.map((item) => {
            const cfg = TICKET_PRIORITY_CONFIG[item.priority as keyof typeof TICKET_PRIORITY_CONFIG];
            return (
              <div key={item.priority} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className={cfg?.color ?? "text-muted-foreground"}>
                    {item.priority.toUpperCase()}
                  </span>
                  <span className="text-muted-foreground">
                    {item.percentage}% cumplimiento
                    {item.total > 0 && (
                      <span className="ml-1 text-[10px]">({item.compliant}/{item.total})</span>
                    )}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      item.percentage >= 90
                        ? "bg-status-ok"
                        : item.percentage >= 70
                          ? "bg-status-warn"
                          : "bg-status-danger"
                    }`}
                    style={{ width: `${item.percentage}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </DashboardCard>

      {/* Urgent attention list */}
      {urgentItems.length > 0 && (
        <DashboardCard title="Requieren atención" alert>
          <div className="space-y-2">
            {urgentItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => router.push(`/ops/tickets/${item.id}`)}
                className="flex w-full items-center gap-2 rounded-lg border border-border bg-card/50 p-2.5 text-left transition-colors hover:bg-accent/30"
              >
                <div
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                    item.slaBreached
                      ? "bg-status-danger-soft text-status-danger-fg"
                      : item.unassigned
                        ? "bg-status-warn-soft border border-status-warn-border text-status-warn-fg"
                        : "bg-status-warn-soft text-status-warn-fg"
                  }`}
                >
                  {item.slaBreached ? (
                    <AlertTriangle className="h-3 w-3" />
                  ) : item.unassigned ? (
                    <UserX className="h-3 w-3" />
                  ) : (
                    <Clock className="h-3 w-3" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[10px] text-muted-foreground">{item.code}</span>
                    <span className={`text-[10px] font-semibold ${
                      TICKET_PRIORITY_CONFIG[item.priority as keyof typeof TICKET_PRIORITY_CONFIG]?.color ?? ""
                    }`}>
                      {item.priority.toUpperCase()}
                    </span>
                  </div>
                  <p className="truncate text-xs font-medium">{item.title}</p>
                </div>
                <span className={`shrink-0 text-[10px] font-medium ${
                  item.slaBreached ? "text-status-danger-fg" : item.unassigned ? "text-status-warn-fg" : "text-status-warn-fg"
                }`}>
                  {item.reason}
                </span>
              </button>
            ))}
          </div>
        </DashboardCard>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  SUBCOMPONENTS
// ═══════════════════════════════════════════════════════════════

function DashboardCard({
  title,
  children,
  alert,
}: {
  title: string;
  children: React.ReactNode;
  alert?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 space-y-3 ${
        alert ? "border-status-danger-border bg-status-danger-soft" : "border-border bg-[#161b22]"
      }`}
    >
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      {children}
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon,
  variant = "default",
  alert,
  subtitle,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  variant?: "default" | "amber" | "red" | "emerald";
  alert?: boolean;
  subtitle?: string;
}) {
  const variantStyles = {
    default: "border-border bg-[#161b22]",
    amber: "border-status-warn-border bg-status-warn-soft",
    red: "border-status-danger-border bg-status-danger-soft",
    emerald: "border-status-ok-border bg-status-ok-soft",
  };

  const iconColors = {
    default: "text-muted-foreground",
    amber: "text-status-warn-fg",
    red: "text-status-danger-fg",
    emerald: "text-status-ok-fg",
  };

  return (
    <div
      className={`rounded-xl border p-3 ${variantStyles[variant]} ${
        alert ? "animate-pulse-subtle" : ""
      }`}
    >
      <div className={`mb-1 ${iconColors[variant]}`}>{icon}</div>
      <p className="text-xl font-bold tabular-nums">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      {subtitle && <p className="text-[9px] text-muted-foreground/60">{subtitle}</p>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  HEATMAP DE CREACIÓN POR DÍA × HORA
// ═══════════════════════════════════════════════════════════════

const DAY_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function TicketsHeatmap({
  heatmap,
  max,
}: {
  heatmap: number[][];
  max: number;
}) {
  // Solo etiquetamos cada 4 horas para que entre en mobile.
  const hours = Array.from({ length: 24 }, (_, h) => h);
  return (
    <div className="overflow-x-auto -mx-2 px-2">
      <table className="min-w-[640px] w-full border-separate border-spacing-y-0.5 border-spacing-x-0">
        <thead>
          <tr>
            <th className="w-10" />
            {hours.map((h) => (
              <th
                key={h}
                className="text-[10px] font-mono text-muted-foreground/70 text-center uppercase"
              >
                {h % 4 === 0 ? `${String(h).padStart(2, "0")}h` : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {heatmap.map((row, dayIdx) => (
            <tr key={dayIdx}>
              <td className="pr-1.5 text-[11px] font-medium text-muted-foreground text-right align-middle">
                {DAY_LABELS[dayIdx]}
              </td>
              {row.map((value, h) => {
                const intensity = max > 0 ? value / max : 0;
                // Discretizamos para evitar opacidades raras: 0 / 0.2 / 0.4 / 0.6 / 0.85.
                const step =
                  intensity === 0
                    ? 0
                    : intensity < 0.25
                      ? 1
                      : intensity < 0.5
                        ? 2
                        : intensity < 0.75
                          ? 3
                          : 4;
                const stepClass =
                  step === 0
                    ? "bg-muted/40"
                    : step === 1
                      ? "bg-primary/20"
                      : step === 2
                        ? "bg-primary/40"
                        : step === 3
                          ? "bg-primary/65"
                          : "bg-primary/90";
                return (
                  <td key={h} className="px-px">
                    <div
                      title={`${DAY_LABELS[dayIdx]} ${String(h).padStart(2, "0")}:00 — ${value} ticket${value === 1 ? "" : "s"}`}
                      className={`h-4 rounded-sm ${stepClass}`}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex items-center justify-end gap-1.5 text-[11px] text-muted-foreground">
        <span>Menos</span>
        <span className="h-2.5 w-2.5 rounded-sm bg-muted/40" />
        <span className="h-2.5 w-2.5 rounded-sm bg-primary/20" />
        <span className="h-2.5 w-2.5 rounded-sm bg-primary/40" />
        <span className="h-2.5 w-2.5 rounded-sm bg-primary/65" />
        <span className="h-2.5 w-2.5 rounded-sm bg-primary/90" />
        <span>Más</span>
      </div>
    </div>
  );
}
