"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Award,
  BarChart3,
  History,
  Medal,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState } from "@/components/opai/LoadingState";
import { EmptyState } from "@/components/opai/EmptyState";
import {
  TrustScoreGauge,
  NivelBadge,
  StreakCounter,
  RankingPosition,
  DimensionBreakdown,
  BadgeGrid,
  PointsHistory,
  TrendChart,
  type GuardiaScorecard,
  type BadgeData,
  type PointEvent,
  type TrendPoint,
} from "@/components/gamification";

/* ─── Props ─── */

interface GuardiaDesempenoTabProps {
  guardiaId: string;
}

/* ─── Component ─── */

export function GuardiaDesempenoTab({ guardiaId }: GuardiaDesempenoTabProps) {
  const [loading, setLoading] = useState(true);
  const [scorecard, setScorecard] = useState<GuardiaScorecard | null>(null);
  const [badges, setBadges] = useState<BadgeData[]>([]);
  const [historial, setHistorial] = useState<PointEvent[]>([]);
  const [tendencia, setTendencia] = useState<TrendPoint[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [scRes, bgRes, hiRes, trRes] = await Promise.all([
        fetch(`/api/gamification/guardia/${guardiaId}`),
        fetch(`/api/gamification/guardia/${guardiaId}/badges`),
        fetch(`/api/gamification/guardia/${guardiaId}/historial`),
        fetch(`/api/gamification/guardia/${guardiaId}/tendencia`),
      ]);
      const [scJ, bgJ, hiJ, trJ] = await Promise.all([
        scRes.json(),
        bgRes.json(),
        hiRes.json(),
        trRes.json(),
      ]);
      if (scJ.success) setScorecard(scJ.data);
      if (bgJ.success) setBadges(bgJ.data ?? []);
      if (hiJ.success) setHistorial(hiJ.data ?? []);
      if (trJ.success) setTendencia(trJ.data ?? []);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [guardiaId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  /* ── Loading state ── */
  if (loading) {
    return <LoadingState type="skeleton" rows={4} />;
  }

  /* ── Empty state ── */
  if (!scorecard) {
    return (
      <EmptyState
        title="Sin datos de desempeno"
        description="Este guardia aun no tiene datos de gamificacion registrados."
        compact
      />
    );
  }

  /* ── Trend diff ── */
  const trendDiff = scorecard.trustScore - scorecard.tendenciaMesAnterior;
  const trendUp = trendDiff >= 0;

  return (
    <div className="space-y-4">
      {/* ── 1. Trust Score Header Card ── */}
      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <TrustScoreGauge score={scorecard.trustScore} size="lg" />
            <div className="flex-1 space-y-2 text-center sm:text-left">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                <NivelBadge nivel={scorecard.nivel} />
                <span className="text-sm text-muted-foreground">
                  {scorecard.puntosMes} pts este mes
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3">
                <StreakCounter days={scorecard.rachaActual} />
                <RankingPosition
                  posicion={scorecard.rankingInstalacion}
                  total={scorecard.totalGuardiasInstalacion}
                />
              </div>
              <div className="flex items-center justify-center sm:justify-start gap-1.5 text-sm">
                {trendUp ? (
                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-red-500" />
                )}
                <span
                  className={
                    trendUp ? "text-emerald-500" : "text-red-500"
                  }
                >
                  {trendUp ? "+" : ""}
                  {trendDiff.toFixed(1)}
                </span>
                <span className="text-muted-foreground">vs mes anterior</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── 2. Dimension Breakdown Card ── */}
      <Card>
        <CardHeader className="p-4 pb-2 sm:p-5 sm:pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            Desglose por dimension
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-2 sm:p-5 sm:pt-2">
          <DimensionBreakdown dimensiones={scorecard.dimensiones} />
        </CardContent>
      </Card>

      {/* ── 3. Badges Card ── */}
      {badges.length > 0 && (
        <Card>
          <CardHeader className="p-4 pb-2 sm:p-5 sm:pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Award className="h-4 w-4 text-muted-foreground" />
              Badges
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-2 sm:p-5 sm:pt-2">
            <BadgeGrid badges={badges} />
          </CardContent>
        </Card>
      )}

      {/* ── 4. Trend Chart Card ── */}
      {tendencia.length > 1 && (
        <Card>
          <CardHeader className="p-4 pb-2 sm:p-5 sm:pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Medal className="h-4 w-4 text-muted-foreground" />
              Tendencia
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-2 sm:p-5 sm:pt-2">
            <TrendChart data={tendencia} height={200} />
          </CardContent>
        </Card>
      )}

      {/* ── 5. Points History Card ── */}
      <Card>
        <CardHeader className="p-4 pb-2 sm:p-5 sm:pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <History className="h-4 w-4 text-muted-foreground" />
            Historial de puntos
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-2 sm:p-5 sm:pt-2">
          <PointsHistory events={historial} showFilter />
        </CardContent>
      </Card>
    </div>
  );
}
