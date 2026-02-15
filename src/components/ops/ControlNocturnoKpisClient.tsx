"use client";

import { useCallback, useEffect, useState } from "react";
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
  };
  installations: InstallationKpi[];
  weeklyTrend: WeeklyTrend[];
};

/* ── Date helpers ── */

function toDateInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/* ── Component ── */

export function ControlNocturnoKpisClient() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<KpiData | null>(null);

  // Default range: last 30 days
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return toDateInput(d);
  });
  const [dateTo, setDateTo] = useState(() => toDateInput(new Date()));

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

  /* Quick range buttons */
  const setRange = (days: number) => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - days);
    setDateFrom(toDateInput(from));
    setDateTo(toDateInput(to));
  };

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
  const alerts = data.installations.filter((i) => i.alert);

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

      {/* ── Global KPI cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
          accent={g.cumplimiento >= 80 ? "emerald" : "red"}
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
          sub={`inst. bajo 80%`}
          icon={<AlertTriangle className="h-4 w-4 text-amber-400" />}
          accent={g.alertCount > 0 ? "amber" : undefined}
        />
      </div>

      {/* ── Period info ── */}
      <p className="text-[11px] text-muted-foreground">
        {data.period.reportCount} reportes entre {data.period.from} y {data.period.to}
      </p>

      {/* ── Charts ── */}
      <ControlNocturnoKpisCharts
        installations={data.installations}
        weeklyTrend={data.weeklyTrend}
      />

      {/* ── Alert table ── */}
      {alerts.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              Instalaciones con bajo cumplimiento (&lt; 80%)
            </h3>
            <div className="space-y-2">
              {alerts.map((inst) => (
                <div
                  key={inst.installationId || inst.installationName}
                  className="flex items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {inst.installationName}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {inst.completadas}/{inst.totalRondas} rondas · {inst.omitidas}{" "}
                      omitidas · {inst.reportCount} reportes
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
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Full ranking table ── */}
      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
            <BarChart3 className="h-4 w-4 text-blue-400" />
            Ranking por instalación
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left py-2 pr-2">#</th>
                  <th className="text-left py-2 pr-4">Instalación</th>
                  <th className="text-center py-2 px-2">Cumpl.</th>
                  <th className="text-center py-2 px-2">Compl.</th>
                  <th className="text-center py-2 px-2">Omit.</th>
                  <th className="text-center py-2 px-2">Desv.</th>
                  <th className="text-center py-2 px-2">Rep.</th>
                </tr>
              </thead>
              <tbody>
                {data.installations.map((inst, idx) => (
                  <tr
                    key={inst.installationId || inst.installationName}
                    className="border-b border-border/50 last:border-0"
                  >
                    <td className="py-2 pr-2 text-muted-foreground">{idx + 1}</td>
                    <td className="py-2 pr-4 font-medium max-w-[200px] truncate">
                      {inst.installationName}
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
                    <td className="py-2 px-2 text-center">
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
                    <td className="py-2 px-2 text-center text-emerald-400">
                      {inst.completadas}
                    </td>
                    <td className="py-2 px-2 text-center text-red-400">
                      {inst.omitidas}
                    </td>
                    <td className="py-2 px-2 text-center text-muted-foreground">
                      {inst.avgDesvMin > 0 ? `${inst.avgDesvMin}m` : "—"}
                    </td>
                    <td className="py-2 px-2 text-center text-muted-foreground">
                      {inst.reportCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
