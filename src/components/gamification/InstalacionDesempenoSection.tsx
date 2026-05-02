"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  Calendar,
  Shield,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Minus,
  Trophy,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, LoadingState, Stat, StatGrid } from "@/components/opai-ds";
import {
  TrustScoreGauge,
  NivelBadge,
  StreakCounter,
  getTrustScoreColor,
} from "@/components/gamification";

/* ─── Types ─── */

interface GuardiaRow {
  posicion: number;
  guardiaId: string;
  code: string;
  nombre: string;
  trustScore: number;
  scoreRondas: number;
  scoreAsistencia: number;
  scoreSistemaDigital: number;
  scoreSupervision: number;
  scoreCapacitacion: number;
  puntosNetos: number;
  rachaActual: number;
  nivelActual: string;
  rankingInstalacion: number | null;
}

interface InstalacionData {
  instalacion: { id: string; name: string };
  periodo: string | null;
  promedioTrustScore: number;
  totalGuardias: number;
  guardias: GuardiaRow[];
}

/* ─── Props ─── */

interface Props {
  instalacionId: string;
}

/* ─── Component ─── */

export function InstalacionDesempenoSection({ instalacionId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<InstalacionData | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/gamification/instalacion/${instalacionId}`);
        const json = await res.json();
        if (json.success) setData(json.data);
      } catch {
        /* silent */
      } finally {
        setLoading(false);
      }
    })();
  }, [instalacionId]);

  /* ── Loading ── */
  if (loading) {
    return <LoadingState type="skeleton" rows={4} />;
  }

  /* ── No data ── */
  if (!data || !data.periodo) {
    return <EmptyState
      icon={<Trophy className="h-8 w-8" />}
      title="Sin datos de gamificación"
      compact
    />;
  }

  /* ── Derived metrics ── */
  const guardias = data.guardias;
  const totalGuardias = data.totalGuardias;

  const avgAsistencia =
    totalGuardias > 0
      ? guardias.reduce((sum, g) => sum + g.scoreAsistencia, 0) / totalGuardias
      : 0;

  const avgRondas =
    totalGuardias > 0
      ? guardias.reduce((sum, g) => sum + g.scoreRondas, 0) / totalGuardias
      : 0;

  // Badges this month: count guards with positive puntosNetos as proxy
  const badgesEsteMes = guardias.filter((g) => g.puntosNetos > 0).length;

  /* ── Trend icon helper ── */
  const TrendIcon = ({ value }: { value: number }) => {
    if (value > 0) return <TrendingUp className="h-3.5 w-3.5 text-status-ok-fg" />;
    if (value < 0) return <TrendingDown className="h-3.5 w-3.5 text-status-danger-fg" />;
    return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
  };

  return (
    <div className="space-y-4">
      {/* ── 1. Top section ── */}
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Left: Trust Score gauge */}
        <Card className="sm:w-48 shrink-0">
          <CardContent className="p-4 flex flex-col items-center justify-center">
            <TrustScoreGauge score={data.promedioTrustScore} size="md" />
            <span className="mt-2 text-xs text-muted-foreground">
              vs {data.promedioTrustScore.toFixed(1)} promedio
            </span>
          </CardContent>
        </Card>

        {/* Right: KPI Grid */}
        <div className="flex-1 min-w-0">
          <StatGrid lgCols={2}>
            <Stat
              label="Guardias"
              value={totalGuardias}
              variant="brand"
              icon={Users}
            />
            <Stat
              label="Asistencia %"
              value={`${avgAsistencia.toFixed(0)}%`}
              variant="ok"
              icon={Calendar}
            />
            <Stat
              label="Rondas %"
              value={`${avgRondas.toFixed(0)}%`}
              variant="brand"
              icon={Shield}
            />
            <Stat
              label="Badges este mes"
              value={badgesEsteMes}
              variant="brand"
              icon={CheckCircle2}
            />
          </StatGrid>
        </div>
      </div>

      {/* ── 2. Ranking table ── */}
      <Card>
        <CardHeader className="p-4 pb-2 sm:p-5 sm:pb-2">
          <CardTitle className="text-sm font-semibold">
            Ranking de guardias
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-2 sm:p-5 sm:pt-2">
          {guardias.length === 0 ? (
            <EmptyState
              icon={<Users className="h-8 w-8" />}
              title="Sin guardias registrados"
              compact
            />
          ) : (
            <div className="space-y-1">
              {guardias.map((g) => (
                <button
                  key={g.guardiaId}
                  onClick={() =>
                    router.push(
                      `/personas/guardias/${g.guardiaId}?tab=desempeno`
                    )
                  }
                  className="w-full flex items-center gap-3 text-left hover:bg-muted/30 -mx-2 px-2 rounded-md transition-colors py-2"
                >
                  {/* Position */}
                  <span className="text-xs font-medium text-muted-foreground w-6 text-right shrink-0">
                    #{g.posicion}
                  </span>

                  {/* Name */}
                  <span className="text-sm font-medium truncate min-w-0 flex-1">
                    {g.nombre}
                  </span>

                  {/* Nivel badge */}
                  <NivelBadge nivel={g.nivelActual} />

                  {/* Streak */}
                  <StreakCounter days={g.rachaActual} size="sm" />

                  {/* Trust score */}
                  <span
                    className={`text-sm font-semibold tabular-nums ${getTrustScoreColor(g.trustScore)}`}
                  >
                    {g.trustScore.toFixed(0)}
                  </span>

                  {/* Points */}
                  <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                    {g.puntosNetos} pts
                  </span>

                  {/* Trend arrow */}
                  <TrendIcon value={g.puntosNetos} />
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
