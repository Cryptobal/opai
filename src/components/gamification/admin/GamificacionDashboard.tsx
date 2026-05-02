"use client";

import { useState, useEffect } from "react";
import { DataTable, EmptyState, LoadingState, Stat, StatGrid, type DataTableColumn } from "@/components/opai-ds";
import { Users, TrendingUp, Trophy, Award } from "lucide-react";
import { toast } from "sonner";

type RankRow = {
  guardiaId?: string;
  posicion: number;
  nombre: string;
  trustScore?: number;
  nivelActual?: string;
  puntosNetos?: number;
};

export function GamificacionDashboard() {
  const [loading, setLoading] = useState(true);
  const [ranking, setRanking] = useState<RankRow[]>([]);
  const [totalGuardias, setTotalGuardias] = useState(0);
  const [avgTrustScore, setAvgTrustScore] = useState(0);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const [, rankingRes] = await Promise.all([
          fetch("/api/gamification/config").then((r) => r.json()),
          fetch("/api/gamification/rankings/global?limit=10").then((r) => r.json()),
        ]);

        if (!mounted) return;

        if (rankingRes.success && rankingRes.data) {
          const data = rankingRes.data;
          setRanking(data.ranking ?? []);
          setTotalGuardias(data.total ?? 0);

          const scores = (data.ranking ?? []) as RankRow[];
          if (scores.length > 0) {
            const avg =
              scores.reduce((s, r) => s + (r.trustScore ?? 0), 0) /
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

  const rankColumns: DataTableColumn<RankRow>[] = [
    {
      id: "posicion",
      header: "#",
      align: "center",
      width: "w-12",
      cell: (row) => (
        <span className="font-mono text-muted-foreground">{row.posicion}</span>
      ),
    },
    { id: "nombre", header: "Guardia", cell: (row) => row.nombre },
    {
      id: "trustScore",
      header: "Trust Score",
      cell: (row) => (
        <span className="font-semibold font-mono">{row.trustScore ?? 0}</span>
      ),
    },
    { id: "nivelActual", header: "Nivel", cell: (row) => row.nivelActual ?? "—" },
    {
      id: "puntosNetos",
      header: "Puntos",
      align: "right",
      cell: (row) => (
        <span className="font-mono">{(row.puntosNetos ?? 0).toLocaleString("es-CL")}</span>
      ),
    },
  ];

  if (loading) return <LoadingState type="skeleton" rows={6} />;

  return (
    <div className="space-y-6">
      <StatGrid lgCols={4}>
        <Stat
          label="Guardias activos"
          value={totalGuardias}
          icon={Users}
          variant="brand"
        />
        <Stat
          label="Trust Score promedio"
          value={avgTrustScore || "—"}
          icon={TrendingUp}
          variant="brand"
        />
        <Stat
          label="Badges"
          value="—"
          icon={Trophy}
          variant="warn"
          hint="Próximamente"
        />
        <Stat
          label="Puntos otorgados"
          value="—"
          icon={Award}
          variant="brand"
          hint="Próximamente"
        />
      </StatGrid>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold">Top 10 Guardias</h2>
        <DataTable
          columns={rankColumns}
          rows={ranking}
          rowKey={(row, i) => row.guardiaId ?? String(i)}
          empty={<EmptyState icon={Trophy} title="No hay datos de ranking disponibles" compact />}
        />
      </div>
    </div>
  );
}
