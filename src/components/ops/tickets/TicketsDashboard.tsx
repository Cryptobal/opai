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

  const { kpis, teamData, weeklyTrend, slaByPriority, urgentItems } = data;

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
                  labelFormatter={(t: string) =>
                    (TICKET_TEAM_CONFIG as Record<string, { label: string }>)[t]?.label ?? t
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
                        ? "bg-emerald-500"
                        : item.percentage >= 70
                          ? "bg-yellow-500"
                          : "bg-red-500"
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
                      ? "bg-red-500/20 text-red-500"
                      : item.unassigned
                        ? "bg-yellow-500/20 text-yellow-500"
                        : "bg-amber-500/20 text-amber-500"
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
                  item.slaBreached ? "text-red-500" : item.unassigned ? "text-yellow-500" : "text-amber-500"
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
        alert ? "border-red-500/30 bg-red-500/5" : "border-border bg-[#161b22]"
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
    amber: "border-amber-500/30 bg-amber-500/5",
    red: "border-red-500/30 bg-red-500/5",
    emerald: "border-emerald-500/30 bg-emerald-500/5",
  };

  const iconColors = {
    default: "text-muted-foreground",
    amber: "text-amber-500",
    red: "text-red-500",
    emerald: "text-emerald-500",
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
