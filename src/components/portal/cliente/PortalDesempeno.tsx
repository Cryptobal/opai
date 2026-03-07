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
  promedioGard: number;
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

/* ─── Component ─── */

export function PortalDesempeno({ session, selectedInstallation }: Props) {
  const [data, setData] = useState<DesempenoData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!selectedInstallation) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/portal/cliente/gamification/instalacion/${selectedInstallation}?tenantId=${encodeURIComponent(session.tenantId)}`
      );
      const j = await res.json();
      if (j.success) setData(j.data);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [selectedInstallation, session.tenantId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* ── Early returns ── */

  if (!selectedInstallation) {
    return <EmptyState title="Selecciona una instalaci\u00f3n" compact />;
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto w-full px-4 py-4 pb-24">
        <LoadingState type="skeleton" rows={4} />
      </div>
    );
  }

  if (!data) {
    return <EmptyState title="Sin datos de desempe\u00f1o" compact />;
  }

  /* ── Derived values ── */

  const diff = data.trustScore - data.promedioGard;
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
      {/* ── 1. Trust Score Card ── */}
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-6">
          <TrustScoreGauge score={data.trustScore} size="lg" />
          <p className="text-sm text-muted-foreground text-center">
            <span className="font-semibold text-foreground">{data.trustScore.toFixed(1)}</span>
            {" vs "}
            <span>{data.promedioGard.toFixed(1)} promedio Gard</span>
            {" "}
            <span className={diffColor}>
              ({diffSign}{diff.toFixed(1)})
            </span>
          </p>
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
          title="D\u00edas sin incidentes"
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
