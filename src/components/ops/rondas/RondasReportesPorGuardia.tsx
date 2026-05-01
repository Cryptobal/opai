"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { RondasTrustTrendChart } from "./RondasTrustTrendChart";
import { RondasReportesTable, type ReporteRow } from "./RondasReportesTable";
import { Bot, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface GuardiaOption {
  id: string;
  label: string;
  code: string;
  rut: string;
  installationName: string;
}

interface Props {
  rows: ReporteRow[];
  guardias: GuardiaOption[];
}

function generateInsight(
  name: string,
  rows: ReporteRow[],
): { icon: typeof TrendingUp; color: string; text: string } {
  if (rows.length < 3) {
    return {
      icon: Minus,
      color: "text-muted-foreground",
      text: `${name} tiene pocas rondas registradas en el período. Se necesitan más datos para generar un análisis detallado.`,
    };
  }

  const scores = rows
    .filter((r) => !r.isAdHoc)
    .map((r) => r.trustScore)
    .filter((s) => s > 0);
  if (scores.length < 3) {
    return {
      icon: Minus,
      color: "text-muted-foreground",
      text: `${name} no tiene suficientes Trust Scores registrados para analizar tendencias.`,
    };
  }

  const half = Math.floor(scores.length / 2);
  const recentAvg = scores.slice(0, half).reduce((a, b) => a + b, 0) / half;
  const olderAvg = scores.slice(half).reduce((a, b) => a + b, 0) / (scores.length - half);
  const diff = Math.round(recentAvg - olderAvg);

  const completedCount = rows.filter((r) => r.status === "completada").length;
  const compliancePct = Math.round((completedCount / rows.length) * 100);

  const avgTrust = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

  if (diff > 3) {
    return {
      icon: TrendingUp,
      color: "text-status-ok-fg",
      text: `El Trust Score de ${name} ha subido ${diff} puntos en el período reciente respecto al anterior. Mantiene un cumplimiento del ${compliancePct}% con Trust promedio de ${avgTrust}. Buen desempeño sostenido.`,
    };
  }
  if (diff < -3) {
    return {
      icon: TrendingDown,
      color: "text-status-danger-fg",
      text: `El Trust Score de ${name} ha bajado ${Math.abs(diff)} puntos recientemente. El cumplimiento es del ${compliancePct}% con Trust promedio de ${avgTrust}. Se recomienda revisar las rondas recientes para identificar causas.`,
    };
  }
  return {
    icon: Minus,
    color: "text-status-info-fg",
    text: `${name} mantiene un Trust Score estable (promedio ${avgTrust}) con cumplimiento del ${compliancePct}%. Consistencia adecuada en ${rows.length} rondas del período.`,
  };
}

export function RondasReportesPorGuardia({ rows, guardias }: Props) {
  const [selectedGuardiaId, setSelectedGuardiaId] = useState("");
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState("scheduledAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const guardiaOptions = useMemo(
    () =>
      guardias.map((g) => ({
        id: g.id,
        label: `${g.label} · ${g.code || g.rut}`,
        description: g.installationName,
        searchText: `${g.label} ${g.code} ${g.rut} ${g.installationName}`,
      })),
    [guardias],
  );

  const selectedGuardia = useMemo(
    () => guardias.find((g) => g.id === selectedGuardiaId),
    [guardias, selectedGuardiaId],
  );

  const guardRows = useMemo(
    () => (selectedGuardiaId ? rows.filter((r) => r.guardiaId === selectedGuardiaId) : []),
    [rows, selectedGuardiaId],
  );

  const stats = useMemo(() => {
    if (guardRows.length === 0) return null;
    const completadas = guardRows.filter((r) => r.status === "completada").length;
    const incompletas = guardRows.filter((r) => r.status === "incompleta").length;
    const scores = guardRows
      .filter((r) => !r.isAdHoc)
      .map((r) => r.trustScore)
      .filter((s) => s > 0);
    return {
      total: guardRows.length,
      completadas,
      incompletas,
      compliance: Math.round((completadas / guardRows.length) * 100),
      trustAvg: scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
    };
  }, [guardRows]);

  const trustTrendData = useMemo(() => {
    const sorted = [...guardRows]
      .filter((r) => !r.isAdHoc && r.trustScore > 0)
      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
    return sorted.map((r, i) => ({
      index: i + 1,
      trustScore: r.trustScore,
      date: r.scheduledAt,
    }));
  }, [guardRows]);

  const insight = useMemo(() => {
    if (!selectedGuardia || guardRows.length === 0) return null;
    return generateInsight(selectedGuardia.label.split(" · ")[0], guardRows);
  }, [selectedGuardia, guardRows]);

  function handleSort(key: string) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
    setPage(0);
  }

  return (
    <div className="space-y-4">
      <div className="max-w-md">
        <SearchableSelect
          value={selectedGuardiaId}
          options={guardiaOptions}
          placeholder="Buscar guardia por nombre, código o RUT..."
          emptyText="Sin guardias"
          onChange={(id) => {
            setSelectedGuardiaId(id);
            setPage(0);
          }}
        />
      </div>

      {selectedGuardia && stats && (
        <>
          <Card>
            <CardContent className="pt-5">
              <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                <div className="flex-1">
                  <h3 className="text-base font-semibold">
                    {selectedGuardia.label.split(" · ")[0]}
                    {selectedGuardia.code && (
                      <span className="text-muted-foreground font-normal ml-2">· {selectedGuardia.code}</span>
                    )}
                  </h3>
                  <p className="text-sm text-muted-foreground">{selectedGuardia.installationName}</p>

                  <div className="flex flex-wrap gap-3 mt-3 text-xs">
                    <span>
                      Total: <strong>{stats.total}</strong>
                    </span>
                    <span className="text-status-ok-fg">
                      Completadas: <strong>{stats.completadas}</strong>
                    </span>
                    <span className="text-status-warn-fg">
                      Incompletas: <strong>{stats.incompletas}</strong>
                    </span>
                    <span>
                      Cumplimiento: <strong>{stats.compliance}%</strong>
                    </span>
                  </div>
                </div>

                <div
                  className={cn(
                    "flex flex-col items-center justify-center rounded-xl border p-3 min-w-[90px]",
                    stats.trustAvg >= 85
                      ? "bg-status-ok-soft border-status-ok-border"
                      : stats.trustAvg >= 70
                        ? "bg-status-info-soft border-blue-500/25"
                        : "bg-status-warn-soft border-amber-500/25",
                  )}
                >
                  <span
                    className={cn(
                      "text-2xl font-bold tabular-nums",
                      stats.trustAvg >= 85
                        ? "text-status-ok-fg"
                        : stats.trustAvg >= 70
                          ? "text-status-info-fg"
                          : "text-status-warn-fg",
                    )}
                  >
                    {stats.trustAvg}
                  </span>
                  <span className="text-[10px] text-muted-foreground mt-0.5">Trust promedio</span>
                </div>
              </div>

              <div className="mt-4">
                <p className="text-xs text-muted-foreground mb-2">
                  Trust Score — últimas {trustTrendData.length} rondas
                </p>
                <RondasTrustTrendChart data={trustTrendData} height={180} />
              </div>
            </CardContent>
          </Card>

          {insight && (
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className="text-[10px] bg-primary/15 text-primary">Insight IA</Badge>
                      <insight.icon className={cn("h-3.5 w-3.5", insight.color)} />
                    </div>
                    <p className="text-sm text-foreground/90 leading-relaxed">{insight.text}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <RondasReportesTable
            rows={guardRows}
            page={page}
            pageSize={20}
            onPageChange={setPage}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSort}
          />
        </>
      )}

      {!selectedGuardiaId && (
        <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
          Selecciona un guardia para ver sus estadísticas
        </div>
      )}
    </div>
  );
}
