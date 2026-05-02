"use client";

import { useEffect, useMemo, useState } from 'react';
import { HubHeatmapBase, type HeatmapColumn, type HeatmapRow } from './HubHeatmapBase';
import { FORMULA_TOOLTIPS } from '../../_lib/hub-formula-tooltips';

interface HeatmapResponse {
  installations: { id: string; name: string }[];
  days: number[];
  grid: number[][];
}

function getCurrentMonthString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * HubVisitHeatmap — wrapper sobre HubHeatmapBase para mostrar visitas
 * de supervisión por instalación × día del mes. Mismo look-and-feel que
 * HubRondasHeatmap, con columna Total a la derecha por fila.
 */
export function HubVisitHeatmap() {
  const [data, setData] = useState<HeatmapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const month = useMemo(() => getCurrentMonthString(), []);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/ops/supervision/visit-heatmap?month=${month}`)
      .then((res) => res.json())
      .then((json: HeatmapResponse) => {
        if (cancelled) return;
        setData(json);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [month]);

  if (loading) {
    return <HubHeatmapBase title="Visitas de supervisión" rows={[]} columns={[]} loading />;
  }
  if (!data) return null;

  const monthLabel = new Date(`${month}-01`).toLocaleDateString('es-CL', {
    month: 'long',
    year: 'numeric',
  });

  const columns: HeatmapColumn[] = data.days.map((d) => ({ label: String(d) }));
  const rows: HeatmapRow[] = data.installations.map((inst, rowIdx) => {
    const grid = data.grid[rowIdx] ?? [];
    const total = grid.reduce((s, v) => s + v, 0);
    return {
      id: inst.id,
      label: inst.name,
      values: grid,
      summary: { value: total, color: '#2DD4A0', label: 'visitas' },
      href: `/ops/supervision/dashboard?installation=${inst.id}`,
    };
  });

  return (
    <HubHeatmapBase
      title={`Visitas de supervisión — ${monthLabel}`}
      subtitle="Conteo de visitas por instalación × día del mes"
      rows={rows}
      columns={columns}
      detailHref="/ops/supervision/dashboard"
      detailLabel="Ver dashboard"
      formulaTooltip={FORMULA_TOOLTIPS.visitasHeatmap}
      desktopCellSize={26}
      labelColWidth={{ mobile: 110, desktop: 200 }}
      emptyState={
        <p className="text-xs text-muted-foreground">No hay instalaciones con visitas este mes.</p>
      }
    />
  );
}
