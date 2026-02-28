"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { KpiCard, KpiGrid } from "@/components/opai";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Legend,
} from "recharts";
import {
  FileText,
  TrendingUp,
  AlertTriangle,
  Shield,
  Star,
} from "lucide-react";

/* ---------- Types ---------- */

type Props = {
  periodLabel: string;
  periodOptions: { value: string; label: string }[];
  canViewAll: boolean;
  dateFrom: string;
  dateTo: string;
};

type DashboardData = {
  totals: {
    visitas: number;
    visitasCompleted: number;
    criticas: number;
    pendientes: number;
    avgDurationMin: number;
    avgRating: number | null;
    trendTotal: number;
    trendCompleted: number;
    instalacionesVisitadas: number;
    instalacionesAsignadas: number;
    coveragePct: number;
  };
  ratings: {
    avgPresentation: number | null;
    avgOrder: number | null;
    avgProtocol: number | null;
  };
  weeklyTrend: { week: string; completed: number; pending: number }[];
  alerts: {
    noVisitInstallations: {
      id: string;
      name: string;
      commune: string | null;
      daysSinceVisit: number | null;
    }[];
    expressVisits: {
      id: string;
      installationName: string;
      date: string;
      durationMinutes: number | null;
    }[];
    openFindingsCount: number;
    overdueFindingsCount: number;
  };
  breakdowns: {
    bySupervisor: {
      supervisorId: string;
      name: string;
      visits: number;
      avgRating: number | null;
      avgDuration: number | null;
    }[];
    byState: Record<string, number>;
    trendByDay: Record<string, number>;
  };
};

/* ---------- Constants ---------- */

const STATE_LABELS: Record<string, string> = {
  normal: "Normal",
  incidencia: "Con observaciones",
  critico: "Crítico",
  sin_estado: "Sin estado",
};

const DONUT_COLORS = ["#10b981", "#f59e0b", "#ef4444", "#6b7280"];

const CHART_COLORS = {
  completed: "#10b981",
  pending: "#3b82f6",
  critical: "#ef4444",
  neutral: "#6b7280",
  purple: "#8b5cf6",
  amber: "#f59e0b",
};

const CHART_STYLE = {
  bg: "#1a2332",
  border: "#2a3441",
  grid: "#2a3441",
  text: "#94a3b8",
};

const tooltipStyle = {
  backgroundColor: CHART_STYLE.bg,
  border: `1px solid ${CHART_STYLE.border}`,
  borderRadius: "8px",
  fontSize: "12px",
};

/* ---------- Component ---------- */

export function SupervisionReportes({
  periodLabel,
  periodOptions,
  canViewAll,
  dateFrom,
  dateTo,
}: Props) {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDashboard() {
      try {
        const res = await fetch(
          `/api/ops/supervision/dashboard?dateFrom=${dateFrom}&dateTo=${dateTo}`,
        );
        const json = await res.json();
        if (res.ok && json.success) {
          setData(json.data);
        }
      } catch {
        // Silently ignore fetch errors
      } finally {
        setLoading(false);
      }
    }
    void fetchDashboard();
  }, [dateFrom, dateTo]);

  function setPeriod(value: string) {
    const params = new URLSearchParams();
    params.set("period", value);
    router.push(`/ops/supervision/reportes?${params.toString()}`);
  }

  const t = data?.totals;

  /* ---------- Derived chart data ---------- */

  const stateData = data
    ? Object.entries(data.breakdowns.byState).map(([key, value]) => ({
        name: STATE_LABELS[key] ?? key,
        value,
      }))
    : [];

  const radarData = data
    ? [
        {
          subject: "Presentación",
          value: data.ratings.avgPresentation ?? 0,
          fullMark: 5,
        },
        {
          subject: "Orden",
          value: data.ratings.avgOrder ?? 0,
          fullMark: 5,
        },
        {
          subject: "Protocolo",
          value: data.ratings.avgProtocol ?? 0,
          fullMark: 5,
        },
      ]
    : [];

  const dailyData = data
    ? Object.entries(data.breakdowns.trendByDay)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, count]) => ({ date: date.slice(5), count }))
    : [];

  const supervisorsSorted = data
    ? [...data.breakdowns.bySupervisor].sort((a, b) => b.visits - a.visits)
    : [];

  /* ---------- Loading state ---------- */

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
        Cargando reportes...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
        No se pudieron cargar los datos del período.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ===== 1. Period Selector ===== */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Período:{" "}
          <span className="font-medium text-foreground">{periodLabel}</span>
        </p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              Cambiar período
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {periodOptions.map((opt) => (
              <DropdownMenuItem
                key={opt.value}
                onClick={() => setPeriod(opt.value)}
              >
                {opt.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* ===== 2. Executive Summary KPIs ===== */}
      <KpiGrid columns={4}>
        <KpiCard
          title="Visitas totales"
          value={t?.visitas ?? 0}
          icon={<FileText className="h-4 w-4" />}
          trend={
            t && t.trendTotal !== 0
              ? t.trendTotal > 0
                ? "up"
                : "down"
              : "neutral"
          }
          trendValue={
            t
              ? `${t.trendTotal > 0 ? "+" : ""}${t.trendTotal}%`
              : undefined
          }
        />
        <KpiCard
          title="Completadas"
          value={t?.visitasCompleted ?? 0}
          variant="emerald"
          icon={<TrendingUp className="h-4 w-4" />}
          trend={
            t && t.trendCompleted !== 0
              ? t.trendCompleted > 0
                ? "up"
                : "down"
              : "neutral"
          }
          trendValue={
            t
              ? `${t.trendCompleted > 0 ? "+" : ""}${t.trendCompleted}%`
              : undefined
          }
        />
        <KpiCard
          title="Cobertura"
          value={t ? `${t.coveragePct}%` : "—"}
          variant="blue"
          description={
            t
              ? `${t.instalacionesVisitadas} de ${t.instalacionesAsignadas} instalaciones`
              : undefined
          }
        />
        <KpiCard
          title="Calificación promedio"
          value={
            t?.avgRating !== null && t?.avgRating !== undefined
              ? t.avgRating.toFixed(1)
              : "—"
          }
          variant="teal"
          icon={<Star className="h-4 w-4" />}
        />
      </KpiGrid>

      {/* ===== 3. Charts Grid ===== */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Chart A - Weekly Trend Bar Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tendencia semanal</CardTitle>
          </CardHeader>
          <CardContent>
            {data.weeklyTrend && data.weeklyTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={data.weeklyTrend}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={CHART_STYLE.grid}
                  />
                  <XAxis
                    dataKey="week"
                    tick={{ fontSize: 11, fill: CHART_STYLE.text }}
                  />
                  <YAxis tick={{ fontSize: 11, fill: CHART_STYLE.text }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend
                    wrapperStyle={{ fontSize: "12px", color: CHART_STYLE.text }}
                  />
                  <Bar
                    dataKey="completed"
                    name="Completadas"
                    fill={CHART_COLORS.completed}
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="pending"
                    name="Pendientes"
                    fill={CHART_COLORS.pending}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Sin datos para el período
              </p>
            )}
          </CardContent>
        </Card>

        {/* Chart B - State Distribution Donut */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Distribución por estado
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stateData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={stateData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={3}
                    dataKey="value"
                    nameKey="name"
                    label={(props) =>
                      `${props.name ?? ""} ${(((props.percent as number) ?? 0) * 100).toFixed(0)}%`
                    }
                    labelLine={false}
                  >
                    {stateData.map((_entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={DONUT_COLORS[index % DONUT_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend
                    wrapperStyle={{ fontSize: "12px", color: CHART_STYLE.text }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Sin datos de estado
              </p>
            )}
          </CardContent>
        </Card>

        {/* Chart C - Ratings Radar */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Calificaciones promedio
            </CardTitle>
          </CardHeader>
          <CardContent>
            {radarData.some((d) => d.value > 0) ? (
              <ResponsiveContainer width="100%" height={280}>
                <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                  <PolarGrid stroke={CHART_STYLE.grid} />
                  <PolarAngleAxis
                    dataKey="subject"
                    tick={{ fontSize: 12, fill: CHART_STYLE.text }}
                  />
                  <PolarRadiusAxis
                    angle={90}
                    domain={[0, 5]}
                    tick={{ fontSize: 10, fill: CHART_STYLE.text }}
                  />
                  <Radar
                    name="Calificación"
                    dataKey="value"
                    stroke={CHART_COLORS.purple}
                    fill={CHART_COLORS.purple}
                    fillOpacity={0.3}
                  />
                  <Tooltip contentStyle={tooltipStyle} />
                </RadarChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Sin datos de calificaciones
              </p>
            )}
          </CardContent>
        </Card>

        {/* Chart D - Daily Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tendencia diaria</CardTitle>
          </CardHeader>
          <CardContent>
            {dailyData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={dailyData}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={CHART_STYLE.grid}
                  />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: CHART_STYLE.text }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: CHART_STYLE.text }}
                    allowDecimals={false}
                  />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar
                    dataKey="count"
                    name="Visitas"
                    fill={CHART_COLORS.amber}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Sin datos diarios
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ===== 4. Supervisor Comparison Table (only if canViewAll) ===== */}
      {canViewAll && supervisorsSorted.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="h-4 w-4" />
              Comparativa por supervisor
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="pb-2 text-left font-medium">Supervisor</th>
                    <th className="pb-2 text-right font-medium">Visitas</th>
                    <th className="pb-2 text-right font-medium">
                      Calificación
                    </th>
                    <th className="pb-2 text-right font-medium">
                      Duración promedio
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {supervisorsSorted.map((s) => (
                    <tr
                      key={s.supervisorId}
                      className="border-b border-border/50"
                    >
                      <td className="py-2">{s.name}</td>
                      <td className="py-2 text-right font-mono">
                        {s.visits}
                      </td>
                      <td className="py-2 text-right font-mono">
                        {s.avgRating !== null ? (
                          <span
                            className={
                              s.avgRating >= 4
                                ? "text-emerald-400"
                                : s.avgRating >= 3
                                  ? "text-amber-400"
                                  : "text-red-400"
                            }
                          >
                            {s.avgRating.toFixed(1)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-2 text-right font-mono">
                        {s.avgDuration ? `${s.avgDuration}m` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ===== 5. Installation Health / Ranking ===== */}
      {data.alerts.noVisitInstallations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              Instalaciones sin visita reciente
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.alerts.noVisitInstallations.map((inst) => {
                const severity =
                  inst.daysSinceVisit === null
                    ? "critical"
                    : inst.daysSinceVisit > 30
                      ? "critical"
                      : inst.daysSinceVisit > 14
                        ? "warning"
                        : "info";

                const severityColor =
                  severity === "critical"
                    ? "text-red-400 border-red-500/30 bg-red-500/5"
                    : severity === "warning"
                      ? "text-amber-400 border-amber-500/30 bg-amber-500/5"
                      : "text-blue-400 border-blue-500/30 bg-blue-500/5";

                return (
                  <div
                    key={inst.id}
                    className={`flex items-center justify-between rounded-md border p-3 ${severityColor}`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {inst.name}
                      </p>
                      {inst.commune && (
                        <p className="text-xs text-muted-foreground">
                          {inst.commune}
                        </p>
                      )}
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        severity === "critical"
                          ? "border-red-500/50 text-red-400"
                          : severity === "warning"
                            ? "border-amber-500/50 text-amber-400"
                            : "border-blue-500/50 text-blue-400"
                      }
                    >
                      {inst.daysSinceVisit !== null
                        ? `${inst.daysSinceVisit} días`
                        : "Nunca visitada"}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
