"use client";

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Info } from 'lucide-react';
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
  const [showFormula, setShowFormula] = useState(false);
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
    return () => { cancelled = true; };
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
    <div className="rounded-lg border border-border bg-card p-3 md:p-4">
      <div className="flex items-center justify-between mb-2 md:mb-3">
        <div className="flex items-center gap-1.5">
          <p className="text-xs md:text-sm font-semibold capitalize">
            Visitas de supervisión — {monthLabel}
          </p>
          <button
            type="button"
            onClick={() => setShowFormula((s) => !s)}
            className="text-muted-foreground hover:text-primary"
            aria-label="Cómo se calcula"
          >
            <Info className="h-3 w-3 md:h-3.5 md:w-3.5" />
          </button>
        </div>
        <Link
          href="/ops/supervision/dashboard"
          className="flex items-center gap-0.5 text-[10px] md:text-xs font-medium text-primary hover:underline"
        >
          Ver dashboard
          <ChevronRight className="h-3 w-3" />
        </Link>
      </div>

      {showFormula && (
        <div className="mb-3 rounded-md border border-primary/30 bg-primary/5 p-2 text-[10px] md:text-xs text-muted-foreground">
          <span className="font-semibold text-primary">¿Cómo se calcula?</span>
          <p className="mt-1 whitespace-pre-line">{FORMULA_TOOLTIPS.visitasHeatmap}</p>
        </div>
      )}

      <div className="overflow-x-auto -mx-1 px-1">
        <div className="inline-block min-w-full">
          {/* Day numbers header */}
          <div
            className="grid gap-px mb-1 ml-[110px] md:ml-[200px]"
            style={{
              gridTemplateColumns: `repeat(${data.days.length}, var(--cell-w))`,
            }}
          >
            {data.days.map((d) => (
              <div
                key={`day-${d}`}
                className="text-[8px] md:text-[11px] text-center text-muted-foreground tabular-nums"
              >
                {d}
              </div>
            ))}
          </div>
          {data.installations.map((inst, rowIdx) => (
            <Link
              key={inst.id}
              href={`/ops/supervision/dashboard?installation=${inst.id}`}
              className="flex items-center gap-px mb-px hover:bg-accent/30 rounded-sm transition-colors"
            >
              <div className="w-[110px] md:w-[200px] pr-2 text-[10px] md:text-xs text-muted-foreground truncate">
                {inst.name}
              </div>
              <div
                className="grid gap-px"
                style={{
                  gridTemplateColumns: `repeat(${data.days.length}, var(--cell-w))`,
                }}
              >
                {data.days.map((day, colIdx) => {
                  const value = data.grid[rowIdx]?.[colIdx] ?? 0;
                  return (
                    <div
                      key={`cell-${inst.id}-${day}`}
                      className="rounded-sm h-3.5 w-3.5 md:h-7 md:w-7"
                      style={{ backgroundColor: getCellColor(value) }}
                      title={`${inst.name} — día ${day}: ${value} visita(s)`}
                    />
                  );
                })}
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-end gap-1.5 mt-3">
        <span className="text-[9px] md:text-[10px] text-muted-foreground">Menos</span>
        {[0, 1, 2, 3, 4].map((v) => (
          <div
            key={`legend-${v}`}
            className="h-2.5 w-2.5 md:h-3.5 md:w-3.5 rounded-sm"
            style={{ backgroundColor: getCellColor(v) }}
          />
        ))}
        <span className="text-[9px] md:text-[10px] text-muted-foreground">Más</span>
      </div>

      <style jsx>{`
        :root { --cell-w: 14px; }
        @media (min-width: 768px) { :root { --cell-w: 28px; } }
      `}</style>
    </div>
  );
}
