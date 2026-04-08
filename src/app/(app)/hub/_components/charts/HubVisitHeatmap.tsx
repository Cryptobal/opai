"use client";

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

interface HeatmapResponse {
  installations: { id: string; name: string }[];
  days: number[];
  grid: number[][];
}

function getCurrentMonthString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getCellColor(value: number): string {
  if (value <= 0) return 'rgba(255,255,255,0.04)';
  if (value === 1) return 'rgba(45,212,160,0.25)';
  if (value === 2) return 'rgba(45,212,160,0.5)';
  if (value === 3) return 'rgba(45,212,160,0.75)';
  return '#2DD4A0';
}

export function HubVisitHeatmap() {
  const [data, setData] = useState<HeatmapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const month = useMemo(() => getCurrentMonthString(), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/ops/supervision/visit-heatmap?month=${month}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json: HeatmapResponse) => {
        if (cancelled) return;
        setData(json);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Error cargando heatmap');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [month]);

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground">Cargando heatmap…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground">
          No se pudo cargar el heatmap de visitas.
        </p>
      </div>
    );
  }

  if (data.installations.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground">
          No hay instalaciones con visitas este mes.
        </p>
      </div>
    );
  }

  const monthLabel = new Date(`${month}-01`).toLocaleDateString('es-CL', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold capitalize">
          Heatmap de visitas — {monthLabel}
        </p>
        <Link
          href="/ops/supervision/dashboard"
          className="flex items-center gap-0.5 text-[10px] font-medium text-primary hover:underline"
        >
          Ver dashboard completo
          <ChevronRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="overflow-x-auto -mx-1 px-1">
        <div className="inline-block min-w-full">
          {/* Day numbers header */}
          <div
            className="grid gap-px ml-[120px] mb-1"
            style={{
              gridTemplateColumns: `repeat(${data.days.length}, 14px)`,
            }}
          >
            {data.days.map((d) => (
              <div
                key={`day-${d}`}
                className="text-[8px] text-center text-muted-foreground tabular-nums"
              >
                {d}
              </div>
            ))}
          </div>
          {/* Rows */}
          {data.installations.map((inst, rowIdx) => (
            <div key={inst.id} className="flex items-center gap-px mb-px">
              <div className="w-[120px] pr-2 text-[10px] text-muted-foreground truncate">
                {inst.name}
              </div>
              <div
                className="grid gap-px"
                style={{
                  gridTemplateColumns: `repeat(${data.days.length}, 14px)`,
                }}
              >
                {data.days.map((day, colIdx) => {
                  const value = data.grid[rowIdx]?.[colIdx] ?? 0;
                  return (
                    <div
                      key={`cell-${inst.id}-${day}`}
                      className="h-3.5 w-3.5 rounded-sm"
                      style={{ backgroundColor: getCellColor(value) }}
                      title={`${inst.name} — día ${day}: ${value} visita(s)`}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-end gap-1.5 mt-3">
        <span className="text-[9px] text-muted-foreground">Menos</span>
        {[0, 1, 2, 3, 4].map((v) => (
          <div
            key={`legend-${v}`}
            className="h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: getCellColor(v) }}
          />
        ))}
        <span className="text-[9px] text-muted-foreground">Más</span>
      </div>
    </div>
  );
}
