"use client";

import { useState, useEffect } from "react";
import { KpiCard } from "@/components/opai/KpiCard";
import { KpiGrid } from "@/components/opai/KpiGrid";
import { DataTable, type DataTableColumn } from "@/components/opai-ds/DataTableLegacy";
import { LoadingState } from "@/components/opai/LoadingState";
import { Users, TrendingUp, Trophy, Award } from "lucide-react";
import { toast } from "sonner";

export function GamificacionDashboard() {
  const [loading, setLoading] = useState(true);
  const [ranking, setRanking] = useState<any[]>([]);
  const [totalGuardias, setTotalGuardias] = useState(0);
  const [avgTrustScore, setAvgTrustScore] = useState(0);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const [configRes, rankingRes] = await Promise.all([
          fetch("/api/gamification/config").then((r) => r.json()),
          fetch("/api/gamification/rankings/global?limit=10").then((r) => r.json()),
        ]);

        if (!mounted) return;

        if (rankingRes.success && rankingRes.data) {
          const data = rankingRes.data;
          setRanking(data.ranking ?? []);
          setTotalGuardias(data.total ?? 0);

          const scores = (data.ranking ?? []) as any[];
          if (scores.length > 0) {
            const avg =
              scores.reduce((s: number, r: any) => s + (r.trustScore ?? 0), 0) /
              scores.length;
            setAvgTrustScore(Math.round(avg * 10) / 10);
          }
        }
      } catch {
        toast.error("Error al cargar dashboard");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, []);

  const rankColumns: DataTableColumn[] = [
    {
      key: "posicion",
      label: "#",
      className: "w-12 text-center",
      render: (v: number) => (
        <span className="font-mono text-muted-foreground">{v}</span>
      ),
    },
    { key: "nombre", label: "Guardia" },
    {
      key: "trustScore",
      label: "Trust Score",
      render: (v: number) => (
        <span className="font-semibold font-mono">{v ?? 0}</span>
      ),
    },
    { key: "nivelActual", label: "Nivel" },
    {
      key: "puntosNetos",
      label: "Puntos",
      render: (v: number) => (
        <span className="font-mono">{(v ?? 0).toLocaleString("es-CL")}</span>
      ),
    },
  ];

  if (loading) return <LoadingState type="skeleton" rows={6} />;

  return (
    <div className="space-y-6">
      <KpiGrid columns={4}>
        <KpiCard
          title="Guardias activos"
          value={totalGuardias}
          icon={<Users className="h-4 w-4" />}
          variant="blue"
        />
        <KpiCard
          title="Trust Score promedio"
          value={avgTrustScore || "—"}
          icon={<TrendingUp className="h-4 w-4" />}
          variant="teal"
        />
        <KpiCard
          title="Badges"
          value="—"
          icon={<Trophy className="h-4 w-4" />}
          variant="amber"
          description="Próximamente"
        />
        <KpiCard
          title="Puntos otorgados"
          value="—"
          icon={<Award className="h-4 w-4" />}
          variant="purple"
          description="Próximamente"
        />
      </KpiGrid>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold">Top 10 Guardias</h2>
        <DataTable
          columns={rankColumns}
          data={ranking}
          loading={false}
          compact
          emptyMessage="No hay datos de ranking disponibles"
        />
      </div>
    </div>
  );
}
