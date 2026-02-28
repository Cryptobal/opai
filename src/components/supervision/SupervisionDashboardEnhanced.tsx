"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
  Cell,
} from "recharts";
import {
  AlertTriangle,
  Clock,
  TrendingUp,
  TrendingDown,
  Minus,
  Star,
  Shield,
} from "lucide-react";

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
  };
  ratings: {
    avgPresentation: number | null;
    avgOrder: number | null;
    avgProtocol: number | null;
  };
  weeklyTrend: { week: string; completed: number; pending: number }[];
  alerts: {
    noVisitInstallations: { id: string; name: string; commune: string | null; daysSinceVisit: number | null }[];
    expressVisits: { id: string; installationName: string; date: string; durationMinutes: number | null }[];
    openFindingsCount: number;
    overdueFindingsCount: number;
  };
  breakdowns: {
    bySupervisor: { supervisorId: string; name: string; visits: number; avgRating: number | null; avgDuration: number | null }[];
    byState: Record<string, number>;
  };
};

type Visit = {
  id: string;
  checkInAt: Date;
  status: string;
  installationState: string | null;
  durationMinutes: number | null;
  installation: { id: string; name: string; commune: string | null };
  supervisor: { id: string; name: string };
  _count?: { guardEvaluations: number; findings: number; photos: number };
};

type Props = {
  visitas: Visit[];
  periodLabel: string;
  periodOptions: { value: string; label: string }[];
  canViewAll: boolean;
  canEdit: boolean;
  canDelete: boolean;
  dateFrom: string;
  dateTo: string;
};

const STATUS_LABELS: Record<string, string> = {
  in_progress: "En progreso",
  completed: "Completada",
  cancelled: "Cancelada",
};

const INSTALLATION_STATE_LABELS: Record<string, string> = {
  normal: "Normal",
  incidencia: "Con observaciones",
  critico: "Crítico",
  sin_estado: "Sin estado",
};

const CHART_COLORS = {
  completed: "#10b981",
  pending: "#3b82f6",
  critical: "#ef4444",
};

export function SupervisionDashboardEnhanced({
  visitas,
  periodLabel,
  periodOptions,
  canViewAll,
  dateFrom,
  dateTo,
}: Props) {
  const router = useRouter();
  const [dashData, setDashData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDashboard() {
      try {
        const res = await fetch(
          `/api/ops/supervision/dashboard?dateFrom=${dateFrom}&dateTo=${dateTo}`,
        );
        const json = await res.json();
        if (res.ok && json.success) {
          setDashData(json.data);
        }
      } catch {
        // Ignore
      } finally {
        setLoading(false);
      }
    }
    void fetchDashboard();
  }, [dateFrom, dateTo]);

  function setPeriod(value: string) {
    const params = new URLSearchParams();
    params.set("period", value);
    router.push(`/ops/supervision?${params.toString()}`);
  }

  const t = dashData?.totals;

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Período: <span className="font-medium text-foreground">{periodLabel}</span>
        </p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              Cambiar período
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {periodOptions.map((opt) => (
              <DropdownMenuItem key={opt.value} onClick={() => setPeriod(opt.value)}>
                {opt.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Row 1: KPI Cards with trends */}
      <KpiGrid columns={3}>
        <KpiCard
          title="Visitas totales"
          value={t?.visitas ?? 0}
          trend={t && t.trendTotal !== 0 ? (t.trendTotal > 0 ? "up" : "down") : "neutral"}
          trendValue={t ? `${t.trendTotal > 0 ? "+" : ""}${t.trendTotal}%` : undefined}
        />
        <KpiCard
          title="Completadas"
          value={t?.visitasCompleted ?? 0}
          variant="emerald"
          trend={t && t.trendCompleted !== 0 ? (t.trendCompleted > 0 ? "up" : "down") : "neutral"}
          trendValue={t ? `${t.trendCompleted > 0 ? "+" : ""}${t.trendCompleted}%` : undefined}
        />
        <KpiCard
          title="Críticas"
          value={t?.criticas ?? 0}
          variant="amber"
        />
        <KpiCard
          title="Pendientes"
          value={t?.pendientes ?? 0}
          variant="blue"
        />
        <KpiCard
          title="Duración promedio"
          value={t ? `${t.avgDurationMin}min` : "—"}
          variant="purple"
        />
        <KpiCard
          title="Calificación promedio"
          value={t?.avgRating !== null && t?.avgRating !== undefined ? t.avgRating.toFixed(1) : "—"}
          variant="teal"
          icon={<Star className="h-4 w-4" />}
        />
      </KpiGrid>

      {/* Row 2: Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Weekly trend chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tendencia semanal</CardTitle>
          </CardHeader>
          <CardContent>
            {dashData?.weeklyTrend && dashData.weeklyTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={dashData.weeklyTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a3441" />
                  <XAxis dataKey="week" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1a2332",
                      border: "1px solid #2a3441",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  <Bar dataKey="completed" name="Completadas" fill={CHART_COLORS.completed} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="pending" name="Pendientes" fill={CHART_COLORS.pending} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {loading ? "Cargando..." : "Sin datos para el período"}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Rating breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Calificaciones promedio</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {dashData?.ratings ? (
              <>
                <RatingBar label="Presentación" value={dashData.ratings.avgPresentation} />
                <RatingBar label="Orden" value={dashData.ratings.avgOrder} />
                <RatingBar label="Protocolo" value={dashData.ratings.avgProtocol} />
              </>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {loading ? "Cargando..." : "Sin datos de calificaciones"}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Alerts and Supervisor performance */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Alerts */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              Alertas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {/* No visit installations */}
            {dashData?.alerts.noVisitInstallations && dashData.alerts.noVisitInstallations.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium text-red-400">
                  Instalaciones sin visita (+7 días):
                </p>
                {dashData.alerts.noVisitInstallations.slice(0, 5).map((inst) => (
                  <p key={inst.id} className="ml-2 text-xs text-muted-foreground">
                    • {inst.name}
                    {inst.daysSinceVisit !== null ? ` — ${inst.daysSinceVisit} días` : " — nunca visitada"}
                  </p>
                ))}
              </div>
            )}

            {/* Express visits */}
            {dashData?.alerts.expressVisits && dashData.alerts.expressVisits.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium text-amber-400">
                  Visitas express (&lt;15m):
                </p>
                {dashData.alerts.expressVisits.slice(0, 3).map((v) => (
                  <p key={v.id} className="ml-2 text-xs text-muted-foreground">
                    • {v.installationName} {v.date} ({v.durationMinutes}m)
                  </p>
                ))}
              </div>
            )}

            {/* Open findings */}
            {dashData?.alerts && dashData.alerts.openFindingsCount > 0 && (
              <div>
                <p className="text-xs font-medium text-amber-400">
                  Hallazgos abiertos: {dashData.alerts.openFindingsCount}
                  {dashData.alerts.overdueFindingsCount > 0 && (
                    <span className="text-red-400">
                      {" "}({dashData.alerts.overdueFindingsCount} vencidos)
                    </span>
                  )}
                </p>
              </div>
            )}

            {!loading &&
              dashData?.alerts.noVisitInstallations.length === 0 &&
              dashData?.alerts.expressVisits.length === 0 &&
              dashData?.alerts.openFindingsCount === 0 && (
                <p className="py-4 text-center text-muted-foreground">
                  Sin alertas activas
                </p>
              )}
          </CardContent>
        </Card>

        {/* Supervisor performance */}
        {canViewAll && dashData?.breakdowns.bySupervisor && dashData.breakdowns.bySupervisor.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Shield className="h-4 w-4" />
                Rendimiento por supervisor
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="pb-2 text-left font-medium">Supervisor</th>
                      <th className="pb-2 text-right font-medium">Visitas</th>
                      <th className="pb-2 text-right font-medium">Calif.</th>
                      <th className="pb-2 text-right font-medium">Durac.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashData.breakdowns.bySupervisor.map((s) => (
                      <tr key={s.supervisorId} className="border-b border-border/50">
                        <td className="py-2">{s.name}</td>
                        <td className="py-2 text-right">{s.visits}</td>
                        <td className="py-2 text-right">{s.avgRating?.toFixed(1) ?? "—"}</td>
                        <td className="py-2 text-right">{s.avgDuration ? `${s.avgDuration}m` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Row 4: Recent visits */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Últimas visitas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {visitas.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay visitas en este período.</p>
          ) : (
            visitas.map((v) => (
              <Link
                key={v.id}
                href={`/ops/supervision/${v.id}`}
                className="flex items-center justify-between gap-2 rounded-md border p-3 transition hover:bg-muted/40"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{v.installation.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Intl.DateTimeFormat("es-CL", {
                      dateStyle: "short",
                      timeStyle: "short",
                    }).format(new Date(v.checkInAt))}
                    {v.durationMinutes != null && ` · ${v.durationMinutes}min`}
                  </p>
                  {canViewAll && (
                    <p className="text-xs text-muted-foreground">
                      {v.supervisor.name}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {v.installationState && (
                    <Badge variant="outline" className="text-[10px]">
                      {INSTALLATION_STATE_LABELS[v.installationState] ?? v.installationState}
                    </Badge>
                  )}
                  <Badge
                    variant={
                      v.status === "completed"
                        ? "success"
                        : v.status === "cancelled"
                          ? "destructive"
                          : "secondary"
                    }
                    className="text-[10px]"
                  >
                    {STATUS_LABELS[v.status] ?? v.status}
                  </Badge>
                </div>
              </Link>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function RatingBar({ label, value }: { label: string; value: number | null }) {
  const pct = value ? (value / 5) * 100 : 0;
  const color =
    value === null
      ? "bg-muted"
      : value >= 4
        ? "bg-emerald-500"
        : value >= 3
          ? "bg-amber-500"
          : "bg-red-500";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{value?.toFixed(1) ?? "—"}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
