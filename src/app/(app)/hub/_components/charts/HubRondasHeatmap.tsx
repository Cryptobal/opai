"use client";

import { useEffect, useState } from 'react';
import { HubHeatmapBase, type HeatmapColumn, type HeatmapRow } from './HubHeatmapBase';
import { FORMULA_TOOLTIPS } from '../../_lib/hub-formula-tooltips';

interface ApiResponse {
  success: boolean;
  days: { label: string; sublabel: string }[];
  installations: { id: string; name: string; grid: number[]; total: number }[];
}

export function HubRondasHeatmap() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/hub/rondas-heatmap')
      .then((r) => r.json())
      .then((j: ApiResponse) => {
        if (!cancelled) {
          setData(j);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  if (loading) return <HubHeatmapBase title="Rondas — últimos 30 días" rows={[]} columns={[]} loading />;
  if (!data || !data.success) return null;

  const columns: HeatmapColumn[] = data.days.map((d) => ({
    label: d.label,
    sublabel: d.sublabel,
  }));
  const rows: HeatmapRow[] = data.installations.map((inst) => ({
    id: inst.id,
    label: inst.name,
    values: inst.grid,
    summary: { value: inst.total, color: '#2DD4A0', label: 'rondas' },
    href: `/ops/rondas?installation=${inst.id}`,
  }));

  return (
    <HubHeatmapBase
      title="Rondas — últimos 30 días"
      subtitle="Conteo de rondas completadas por instalación × día"
      rows={rows}
      columns={columns}
      detailHref="/ops/rondas"
      detailLabel="Ver módulo"
      formulaTooltip={FORMULA_TOOLTIPS.rondasHeatmap}
      desktopCellSize={26}
      labelColWidth={{ mobile: 110, desktop: 200 }}
      emptyState={
        <p className="text-xs text-muted-foreground">Sin rondas completadas en los últimos 30 días.</p>
      }
    />
  );
}
