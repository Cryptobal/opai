"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  Loader2,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  XCircle,
  BarChart3,
  ArrowLeft,
  CalendarDays,
  ShieldAlert,
  Timer,
  ExternalLink,
} from "lucide-react";
import { ControlNocturnoKpisCharts } from "./ControlNocturnoKpisCharts";

/* ── Types ── */

type InstallationKpi = {
  installationId: string | null;
  installationName: string;
  totalRondas: number;
  completadas: number;
  omitidas: number;
  cumplimiento: number;
  avgDesvMin: number;
  reportCount: number;
  novedades: number;
  criticos: number;
  alert: boolean;
};

type WeeklyTrend = {
  weekLabel: string;
  weekStart: string;
  cumplimiento: number;
  totalRondas: number;
  completadas: number;
};

type KpiData = {
  period: { from: string; to: string; reportCount: number };
  global: {
    totalRondas: number;
    completadas: number;
    omitidas: number;
    cumplimiento: number;
    alertCount: number;
    criticalCount: number;
    avgDesvMin: number;
  };
  installations: InstallationKpi[];
  weeklyTrend: WeeklyTrend[];
  topRisks: InstallationKpi[];
  topBest: InstallationKpi[];
  snapshot: {
    week: {
      current: { cumplimiento: number; omitidas: number; alertCount: number };
      previous: { cumplimiento: number; omitidas: number; alertCount: number };
      deltaCumplimiento: number;
      deltaOmitidas: number;
      deltaAlertCount: number;
    };
    mtd: {
      current: { cumplimiento: number; omitidas: number; alertCount: number };
      previous: { cumplimiento: number; omitidas: number; alertCount: number };
      deltaCumplimiento: number;
      deltaOmitidas: number;
      deltaAlertCount: number;
    };
    ytd: {
      current: { cumplimiento: number; omitidas: number; alertCount: number };
      previous: { cumplimiento: number; omitidas: number; alertCount: number };
      deltaCumplimiento: number;
      deltaOmitidas: number;
      deltaAlertCount: number;
    };
  };
};

/* ── Date helpers ── */

function toDateInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/* ── Component ── */

export function ControlNocturnoKpisClient() {
  const KPI_TARGET = 80;
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<KpiData | null>(null);

  // Default range: last 30 days
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return toDateInput(d);
  });
  const [dateTo, setDateTo] = useState(() => toDateInput(new Date()));
  const [searchInstallation, setSearchInstallation] = useState("");
  const [tablePage, setTablePage] = useState(1);
  const [chartMode, setChartMode] = useState<"risk" | "best" | "all">("risk");

  const fetchKpis = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/ops/control-nocturno/kpis?dateFrom=${dateFrom}&dateTo=${dateTo}`,
      );
      const json = await res.json();
      if (json.success) setData(json.data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    fetchKpis();
  }, [fetchKpis]);

  useEffect(() => {
    setTablePage(1);
  }, [searchInstallation, dateFrom, dateTo]);

  /* Quick range buttons */
  const setRange = (days: number) => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - days);
    setDateFrom(toDateInput(from));
    setDateTo(toDateInput(to));
  };

  const installations = data?.installations ?? [];
  const topRisks = data?.topRisks ?? [];
  const filteredInstallations = useMemo(() => {
    const q = searchInstallation.trim().toLowerCase();
    if (!q) return installations;
    return installations.filter((i) =>
      i.installationName.toLowerCase().includes(q),
    );
  }, [installations, searchInstallation]);
  const pageSize = 25;
  const totalPages = Math.max(1, Math.ceil(filteredInstallations.length / pageSize));
  const currentPage = Math.min(tablePage, totalPages);
  const pageRows = filteredInstallations.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-muted-foreground">No se pudieron cargar los KPIs</p>
      </div>
    );
  }

  const g = data.global;
  const alerts = topRisks.slice(0, 10);

  return (
    <div className="space-y-6">
      {/* ── Back link + filters ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href="/ops/control-nocturno"
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver a reportes
        </Link>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            variant="ghost"
            className="text-xs h-7"
            onClick={() => setRange(7)}
          >
            7d
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-xs h-7"
            onClick={() => setRange(30)}
          >
            30d
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-xs h-7"
            onClick={() => setRange(90)}
          >
            90d
          </Button>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-7 rounded-md border border-input bg-background px-2 text-xs"
          />
          <span className="text-xs text-muted-foreground">—</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-7 rounded-md border border-input bg-background px-2 text-xs"
          />
        </div>
      </div>

      {/* ── Executive snapshot ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <PeriodCard
          label="Semana"
          value={`${data.snapshot.week.current.cumplimiento}%`}
          delta={data.snapshot.week.deltaCumplimiento}
          deltaContext="vs semana equivalente anterior"
          sub={`Omitidas: ${data.snapshot.week.current.omitidas} · Alertas: ${data.snapshot.week.current.alertCount}`}
          icon={<CalendarDays className="h-4 w-4 text-sky-400" />}
        />
        <PeriodCard
          label="MTD (mes a la fecha)"
          value={`${data.snapshot.mtd.current.cumplimiento}%`}
          delta={data.snapshot.mtd.deltaCumplimiento}
          deltaContext="vs mismo tramo del mes anterior"
          sub={`Omitidas: ${data.snapshot.mtd.current.omitidas} · Alertas: ${data.snapshot.mtd.current.alertCount}`}
          icon={<ShieldAlert className="h-4 w-4 text-indigo-400" />}
        />
        <PeriodCard
          label="YTD (año a la fecha)"
          value={`${data.snapshot.ytd.current.cumplimiento}%`}
          delta={data.snapshot.ytd.deltaCumplimiento}
          deltaContext="vs mismo tramo del año anterior"
          sub={`Omitidas: ${data.snapshot.ytd.current.omitidas} · Alertas: ${data.snapshot.ytd.current.alertCount}`}
          icon={<Timer className="h-4 w-4 text-violet-400" />}
        />
      </div>

      {/* ── Global KPI cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard
          label="Cumplimiento"
          value={`${g.cumplimiento}%`}
          icon={
            g.cumplimiento >= 80 ? (
              <TrendingUp className="h-4 w-4 text-emerald-400" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-400" />
            )
          }
          accent={g.cumplimiento >= KPI_TARGET ? "emerald" : "red"}
        />
        <KpiCard
          label="Rondas completadas"
          value={g.completadas.toLocaleString("es-CL")}
          sub={`de ${g.totalRondas.toLocaleString("es-CL")}`}
          icon={<CheckCircle2 className="h-4 w-4 text-emerald-400" />}
        />
        <KpiCard
          label="Rondas omitidas"
          value={g.omitidas.toLocaleString("es-CL")}
          icon={<XCircle className="h-4 w-4 text-red-400" />}
          accent={g.omitidas > 0 ? "red" : undefined}
        />
        <KpiCard
          label="Alertas"
          value={String(g.alertCount)}
          sub={`inst. bajo ${KPI_TARGET}%`}
          icon={<AlertTriangle className="h-4 w-4 text-amber-400" />}
          accent={g.alertCount > 0 ? "amber" : undefined}
        />
        <KpiCard
          label="Inst. críticas"
          value={String(g.criticalCount)}
          icon={<ShieldAlert className="h-4 w-4 text-rose-400" />}
          accent={g.criticalCount > 0 ? "red" : undefined}
        />
        <KpiCard
          label="Desvío prom."
          value={g.avgDesvMin > 0 ? `${g.avgDesvMin}m` : "—"}
          icon={<Timer className="h-4 w-4 text-sky-400" />}
        />
      </div>

      {/* ── Period info ── */}
      <p className="text-[11px] text-muted-foreground">
        {data.period.reportCount} reportes entre {data.period.from} y {data.period.to}
      </p>

      {/* ── Charts ── */}
      <div className="flex items-center gap-2">
        <p className="text-xs text-muted-foreground">Vista de gráfico:</p>
        <Button
          size="sm"
          variant={chartMode === "risk" ? "default" : "outline"}
          className="h-7 text-xs"
          onClick={() => setChartMode("risk")}
        >
          Riesgo
        </Button>
        <Button
          size="sm"
          variant={chartMode === "best" ? "default" : "outline"}
          className="h-7 text-xs"
          onClick={() => setChartMode("best")}
        >
          Desempeño
        </Button>
        <Button
          size="sm"
          variant={chartMode === "all" ? "default" : "outline"}
          className="h-7 text-xs"
          onClick={() => setChartMode("all")}
        >
          Todas
        </Button>
      </div>
      <ControlNocturnoKpisCharts
        installations={data.installations}
        weeklyTrend={data.weeklyTrend}
        mode={chartMode}
      />

      {/* ── Top risks + top performers ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              Top 10 riesgos operativos
            </h3>
            <p className="mb-3 text-[11px] text-muted-foreground">
              Instalaciones con mayor riesgo operativo: prioridad por críticas y luego por cumplimiento bajo meta ({KPI_TARGET}%).
            </p>
            <div className="space-y-2">
              {alerts.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sin riesgos relevantes en el período.</p>
              ) : (
                alerts.map((inst) => (
                  <div
                    key={inst.installationId || inst.installationName}
                    className="flex items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2"
                  >
                    <div className="flex-1 min-w-0">
                      {inst.installationId ? (
                        <Link
                          href={`/crm/installations/${inst.installationId}`}
                          className="inline-flex max-w-full items-center gap-1 text-sm font-medium hover:underline"
                        >
                          <span className="truncate">{inst.installationName}</span>
                          <ExternalLink className="h-3 w-3 shrink-0 opacity-70" />
                        </Link>
                      ) : (
                        <p className="text-sm font-medium truncate">{inst.installationName}</p>
                      )}
                      <p className="text-[11px] text-muted-foreground">
                        Cumplimiento: {inst.cumplimiento}% · Omitidas: {inst.omitidas} · Críticas: {inst.criticos}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p
                        className={`text-lg font-bold ${
                          inst.cumplimiento < 50 ? "text-red-400" : "text-amber-400"
                        }`}
                      >
                        {inst.cumplimiento}%
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              Top desempeño (sobre meta)
            </h3>
            <p className="mb-3 text-[11px] text-muted-foreground">
              Solo considera instalaciones con cumplimiento mayor o igual a {KPI_TARGET}%.
            </p>
            <div className="space-y-2">
              {data.topBest.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No hay instalaciones sobre la meta en el período seleccionado.
                </p>
              ) : (
                data.topBest.slice(0, 10).map((inst) => (
                  <div
                    key={inst.installationId || inst.installationName}
                    className="flex items-center gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2"
                  >
                    <div className="flex-1 min-w-0">
                      {inst.installationId ? (
                        <Link
                          href={`/crm/installations/${inst.installationId}`}
                          className="inline-flex max-w-full items-center gap-1 text-sm font-medium hover:underline"
                        >
                          <span className="truncate">{inst.installationName}</span>
                          <ExternalLink className="h-3 w-3 shrink-0 opacity-70" />
                        </Link>
                      ) : (
                        <p className="text-sm font-medium truncate">{inst.installationName}</p>
                      )}
                      <p className="text-[11px] text-muted-foreground">
                        Completadas: {inst.completadas}/{inst.totalRondas} · Omitidas: {inst.omitidas}
                      </p>
                    </div>
                    <p className="text-lg font-bold text-emerald-400 shrink-0">{inst.cumplimiento}%</p>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Full ranking table ── */}
      <Card>
        <CardContent className="p-4">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-blue-400" />
              Ranking por instalación
            </h3>
            <input
              type="text"
              value={searchInstallation}
              onChange={(e) => setSearchInstallation(e.target.value)}
              placeholder="Buscar instalación..."
              className="h-8 w-full sm:w-64 rounded-md border border-input bg-background px-2 text-xs"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">#</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Instalación</th>
                  <th className="px-3 py-2 text-center font-medium text-muted-foreground">Cumpl.</th>
                  <th className="px-3 py-2 text-center font-medium text-muted-foreground">Compl.</th>
                  <th className="px-3 py-2 text-center font-medium text-muted-foreground">Omit.</th>
                  <th className="px-3 py-2 text-center font-medium text-muted-foreground">Desv.</th>
                  <th className="px-3 py-2 text-center font-medium text-muted-foreground">Rep.</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((inst, idx) => (
                  <tr
                    key={inst.installationId || inst.installationName}
                    className="border-b border-border/60 last:border-0"
                  >
                    <td className="px-3 py-2 text-muted-foreground">
                      {(currentPage - 1) * pageSize + idx + 1}
                    </td>
                    <td className="px-3 py-2 font-medium max-w-[200px] truncate">
                      {inst.installationId ? (
                        <Link
                          href={`/crm/installations/${inst.installationId}`}
                          className="inline-flex max-w-full items-center gap-1 hover:underline"
                        >
                          <span className="truncate">{inst.installationName}</span>
                          <ExternalLink className="h-3 w-3 shrink-0 opacity-70" />
                        </Link>
                      ) : (
                        inst.installationName
                      )}
                      {inst.criticos > 0 && (
                        <span className="ml-1.5 inline-flex items-center rounded-full bg-red-500/15 px-1.5 py-0.5 text-[10px] text-red-400">
                          {inst.criticos} crít.
                        </span>
                      )}
                      {inst.novedades > 0 && (
                        <span className="ml-1 inline-flex items-center rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-400">
                          {inst.novedades} nov.
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 font-semibold ${
                          inst.cumplimiento >= 80
                            ? "bg-emerald-500/15 text-emerald-400"
                            : inst.cumplimiento >= 50
                              ? "bg-amber-500/15 text-amber-400"
                              : "bg-red-500/15 text-red-400"
                        }`}
                      >
                        {inst.cumplimiento}%
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center text-emerald-400">
                      {inst.completadas}
                    </td>
                    <td className="px-3 py-2 text-center text-red-400">
                      {inst.omitidas}
                    </td>
                    <td className="px-3 py-2 text-center text-muted-foreground">
                      {inst.avgDesvMin > 0 ? `${inst.avgDesvMin}m` : "—"}
                    </td>
                    <td className="px-3 py-2 text-center text-muted-foreground">
                      {inst.reportCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>
              Mostrando {(currentPage - 1) * pageSize + 1}-
              {Math.min(currentPage * pageSize, filteredInstallations.length)} de{" "}
              {filteredInstallations.length}
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                disabled={currentPage <= 1}
                onClick={() => setTablePage((p) => Math.max(1, p - 1))}
              >
                Anterior
              </Button>
              <span className="text-xs">
                Página {currentPage} / {totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                disabled={currentPage >= totalPages}
                onClick={() => setTablePage((p) => Math.min(totalPages, p + 1))}
              >
                Siguiente
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ── KPI Card ── */

function KpiCard({
  label,
  value,
  sub,
  icon,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  accent?: "emerald" | "red" | "amber";
}) {
  const accentClass =
    accent === "red"
      ? "text-red-400"
      : accent === "amber"
        ? "text-amber-400"
        : accent === "emerald"
          ? "text-emerald-400"
          : "";
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center justify-between mb-1">
          <p className="text-[11px] text-muted-foreground">{label}</p>
          {icon}
        </div>
        <p className={`text-xl font-bold ${accentClass}`}>{value}</p>
        {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function PeriodCard({
  label,
  value,
  delta,
  deltaContext,
  sub,
  icon,
}: {
  label: string;
  value: string;
  delta: number;
  deltaContext: string;
  sub: string;
  icon: React.ReactNode;
}) {
  const positive = delta >= 0;
  const absDelta = Math.abs(delta);
  const deltaClass =
    absDelta === 0 ? "text-muted-foreground" : positive ? "text-emerald-400" : "text-red-400";
  const deltaLabel =
    absDelta === 0
      ? "Sin cambio"
      : `${positive ? "Mejora" : "Baja"} ${absDelta} punto${absDelta === 1 ? "" : "s"}`;
  return (
    <Card>
      <CardContent className="p-3">
        <div className="mb-1 flex items-center justify-between">
          <p className="text-[11px] text-muted-foreground">{label}</p>
          {icon}
        </div>
        <div className="flex items-end gap-2">
          <p className="text-xl font-bold">{value}</p>
          <span
            className={`text-[11px] font-semibold ${deltaClass}`}
          >
            {deltaLabel}
          </span>
        </div>
        <p className="mt-0.5 text-[10px] text-muted-foreground">{deltaContext}</p>
        <p className="mt-0.5 text-[10px] text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}
