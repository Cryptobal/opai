"use client";

import { useState, useEffect, useCallback } from "react";
import { Users, Calendar, Shield, CheckCircle2, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrustScoreGauge, NivelBadge, getTrustScoreColor } from "@/components/gamification";
import { KpiCard } from "@/components/opai/KpiCard";
import { KpiGrid } from "@/components/opai/KpiGrid";
import { LoadingState } from "@/components/opai/LoadingState";
import { EmptyState } from "@/components/opai/EmptyState";
import { ClienteSession } from "@/lib/portal-cliente-types";
import { PreviewBadge } from "./PreviewBadge";
import { OpaiBadge } from "./OpaiBadge";

/* ─── Types ─── */

interface GuardRanking {
  guardiaId: string;
  nombre: string;
  nivel: string;
  trustScore: number;
  asistencia: number;
  tendencia: "up" | "down" | "neutral";
}

interface DesempenoData {
  trustScore: number;
  promedioIndustria: number | null;
  kpis: {
    guardiasActivos: number;
    asistenciaMes: number;
    rondasCompletadas: number;
    diasSinIncidentes: number;
  };
  guardias: GuardRanking[];
}

interface Props {
  session: ClienteSession;
  selectedInstallation: string | null;
  isProspect?: boolean;
}

const DEMO_GAMIFICATION: DesempenoData = {
  trustScore: 8.6,
  promedioIndustria: null,
  kpis: {
    guardiasActivos: 3,
    asistenciaMes: 95.3,
    rondasCompletadas: 24,
    diasSinIncidentes: 18,
  },
  guardias: [
    { guardiaId: "demo-1", nombre: "R. Muñoz", nivel: "Avanzado", trustScore: 9.2, asistencia: 98, tendencia: "up" },
    { guardiaId: "demo-2", nombre: "C. Soto", nivel: "Intermedio", trustScore: 8.8, asistencia: 95, tendencia: "up" },
    { guardiaId: "demo-3", nombre: "P. Vargas", nivel: "Intermedio", trustScore: 8.1, asistencia: 93, tendencia: "neutral" },
  ],
};

/* ─── Component ─── */

export function PortalDesempeno({ session, selectedInstallation, isProspect }: Props) {
  const [data, setData] = useState<DesempenoData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (isProspect) {
      setData(DEMO_GAMIFICATION);
      return;
    }
    if (!selectedInstallation) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/portal/cliente/gamification/instalacion/${selectedInstallation}?tenantId=${encodeURIComponent(session.tenantId)}`
      );
      const j = await res.json();
      if (j.success && j.data) {
        const apiData = j.data;
        const ranking = apiData.ranking ?? [];
        const avgScore = apiData.trustScoreAvg ?? 0;
        setData({
          trustScore: avgScore,
          promedioIndustria: apiData.promedioIndustria ?? null,
          kpis: {
            guardiasActivos: ranking.length,
            asistenciaMes: ranking.length > 0
              ? Math.round(ranking.reduce((s: number, g: { scoreAsistencia: number }) => s + (g.scoreAsistencia ?? 0), 0) / ranking.length)
              : 0,
            rondasCompletadas: ranking.length > 0
              ? Math.round(ranking.reduce((s: number, g: { scoreRondas: number }) => s + (g.scoreRondas ?? 0), 0) / ranking.length)
              : 0,
            diasSinIncidentes: typeof apiData.diasSinIncidentes === "number" ? apiData.diasSinIncidentes : 0,
          },
          guardias: ranking.map((g: { guardiaId: string; nombre: string; nivelActual: string; trustScore: number; scoreAsistencia: number; rachaActual: number }) => ({
            guardiaId: g.guardiaId,
            nombre: g.nombre,
            nivel: g.nivelActual ?? "Básico",
            trustScore: g.trustScore ?? 0,
            asistencia: g.scoreAsistencia ?? 0,
            tendencia: (g.rachaActual ?? 0) > 0 ? "up" as const : (g.rachaActual ?? 0) < 0 ? "down" as const : "neutral" as const,
          })),
        });
      }
    } catch (err) {
      console.error("[PortalDesempeno] Error:", err);
      setError("No se pudieron cargar los datos de desempeño");
    } finally {
      setLoading(false);
    }
  }, [selectedInstallation, session.tenantId, isProspect]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* ── Early returns ── */

  if (!isProspect && !selectedInstallation) {
    return <EmptyState title="Selecciona una instalación" compact />;
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto w-full px-4 py-4 pb-24">
        <LoadingState type="skeleton" rows={4} />
      </div>
    );
  }

  if (error) {
    return <EmptyState title={error} compact />;
  }

  if (!data) {
    return <EmptyState title="Sin datos de desempeño" compact />;
  }

  /* ── Derived values ── */

  const industryAvg = data.promedioIndustria;
  const hasIndustryAvg = typeof industryAvg === "number";
  const diff = hasIndustryAvg ? data.trustScore - industryAvg : 0;
  const diffSign = diff >= 0 ? "+" : "";
  const diffColor = diff >= 0 ? "text-emerald-400" : "text-red-400";
  const sortedGuards = [...data.guardias].sort((a, b) => b.trustScore - a.trustScore);

  const TrendIcon = (t: "up" | "down" | "neutral") => {
    if (t === "up") return TrendingUp;
    if (t === "down") return TrendingDown;
    return Minus;
  };

  return (
    <div className="max-w-6xl mx-auto w-full px-4 py-4 pb-24 space-y-4">
      {isProspect ? (
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-sm font-semibold">Desempeño y gamificación</h3>
          <PreviewBadge />
          <OpaiBadge variant="exclusive" />
        </div>
      ) : (
        <div className="mb-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">Desempeño y gamificación</h3>
            <OpaiBadge variant="exclusive" />
          </div>
          <p className="text-xs text-zinc-500 mt-1">Sistema de evaluación continua — Tus guardias compiten por ser los mejores</p>
        </div>
      )}

      {/* ── 1. Trust Score Card ── */}
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-6">
          <TrustScoreGauge score={data.trustScore} size="lg" />
          {hasIndustryAvg ? (
            <p className="text-sm text-muted-foreground text-center">
              <span className="font-semibold text-foreground">{data.trustScore.toFixed(1)}</span>
              {" vs "}
              <span>{industryAvg.toFixed(1)} promedio industria</span>
              {" "}
              <span className={diffColor}>
                ({diffSign}{diff.toFixed(1)})
              </span>
            </p>
          ) : (
            <p className="text-xs text-muted-foreground text-center">
              Comparativa disponible con más historial
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── 2. KPIs Grid ── */}
      <KpiGrid columns={4}>
        <KpiCard
          title="Guardias activos"
          value={data.kpis.guardiasActivos}
          icon={<Users className="h-4 w-4" />}
          variant="teal"
        />
        <KpiCard
          title="Asistencia mes"
          value={`${data.kpis.asistenciaMes}%`}
          icon={<Calendar className="h-4 w-4" />}
          variant="emerald"
        />
        <KpiCard
          title="Rondas completadas"
          value={`${data.kpis.rondasCompletadas}%`}
          icon={<Shield className="h-4 w-4" />}
          variant="blue"
        />
        <KpiCard
          title="Días sin incidentes"
          value={data.kpis.diasSinIncidentes}
          icon={<CheckCircle2 className="h-4 w-4" />}
          variant="amber"
        />
      </KpiGrid>

      {/* ── 3. Guard Ranking Table ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ranking de Guardias</CardTitle>
        </CardHeader>
        <CardContent>
          {sortedGuards.length === 0 ? (
            <EmptyState title="Sin guardias asignados" compact />
          ) : (
            <div className="divide-y divide-border">
              {sortedGuards.map((guard, idx) => {
                const Icon = TrendIcon(guard.tendencia);
                const trendColor =
                  guard.tendencia === "up"
                    ? "text-emerald-400"
                    : guard.tendencia === "down"
                    ? "text-red-400"
                    : "text-muted-foreground";
                return (
                  <div
                    key={guard.guardiaId}
                    className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    {/* Position */}
                    <span className="text-sm font-mono text-muted-foreground w-6 text-right shrink-0">
                      #{idx + 1}
                    </span>

                    {/* Name + badge + asistencia */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{guard.nombre}</span>
                        <NivelBadge nivel={guard.nivel} />
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Asistencia: {guard.asistencia}%
                      </p>
                    </div>

                    {/* Trust score + trend */}
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-sm font-semibold font-mono ${getTrustScoreColor(guard.trustScore)}`}>
                        {guard.trustScore.toFixed(1)}
                      </span>
                      <Icon className={`h-4 w-4 ${trendColor}`} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
