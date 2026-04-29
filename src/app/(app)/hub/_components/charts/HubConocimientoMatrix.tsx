"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Info, ChevronRight, Brain } from 'lucide-react';
import { FORMULA_TOOLTIPS } from '../../_lib/hub-formula-tooltips';

interface InstRow {
  id: string;
  name: string;
  total: number;
  avg: number | null;
  below60: number;
  between60_80: number;
  above80: number;
  withoutExam: number;
}
interface ApiResponse { success: boolean; installations: InstRow[]; }

function avgColor(avg: number | null): string {
  if (avg == null) return 'rgba(120,120,120,0.3)';
  if (avg < 50) return 'rgba(239,68,68,0.85)';
  if (avg < 70) return 'rgba(249,115,22,0.8)';
  if (avg < 85) return 'rgba(234,179,8,0.75)';
  return 'rgba(45,212,160,0.85)';
}

export function HubConocimientoMatrix() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showFormula, setShowFormula] = useState(false);

  useEffect(() => {
    fetch('/api/hub/conocimiento-heatmap')
      .then((r) => r.json())
      .then((j) => { setData(j); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-3 md:p-4">
        <p className="text-xs text-muted-foreground">Cargando conocimiento…</p>
      </div>
    );
  }

  if (!data?.success || data.installations.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-1.5 mb-1">
          <Brain className="h-4 w-4 text-muted-foreground" />
          <p className="text-xs font-semibold">Conocimiento por instalación</p>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          No hay guardias activos con pruebas completadas todavía.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3 md:p-4">
      <div className="flex items-center justify-between mb-2 md:mb-3">
        <div className="flex items-center gap-1.5">
          <Brain className="h-3.5 w-3.5 md:h-4 md:w-4 text-primary" />
          <p className="text-xs md:text-sm font-semibold">Conocimiento por instalación</p>
          <button
            type="button"
            onClick={() => setShowFormula((s) => !s)}
            className="text-primary/70 hover:text-primary"
            aria-label="Cómo se calcula"
          >
            <Info className="h-4 w-4" />
          </button>
        </div>
        <Link
          href="/personas/guardias"
          className="flex items-center gap-0.5 text-[10px] md:text-xs font-medium text-primary hover:underline"
        >
          Ver detalle
          <ChevronRight className="h-3 w-3" />
        </Link>
      </div>

      {showFormula && (
        <div className="mb-3 rounded-md border border-primary/30 bg-primary/5 p-2 text-[10px] md:text-xs text-muted-foreground">
          <span className="font-semibold text-primary">¿Cómo se calcula?</span>
          <p className="mt-1 whitespace-pre-line">{FORMULA_TOOLTIPS.conocimientoMatrix}</p>
        </div>
      )}

      <p className="text-[10px] md:text-xs text-muted-foreground mb-2">
        Foto actual · ordenado por instalaciones más débiles primero
      </p>

      <div className="overflow-x-auto">
        <table className="min-w-full text-[11px] md:text-sm">
          <thead>
            <tr className="text-muted-foreground border-b border-border">
              <th className="text-left font-medium pb-2 pr-2">Instalación</th>
              <th className="text-center font-medium pb-2 px-1 md:px-2">Promedio</th>
              <th className="text-center font-medium pb-2 px-1 md:px-2">Activos</th>
              <th className="text-center font-medium pb-2 px-1 md:px-2 text-red-400">&lt;60</th>
              <th className="text-center font-medium pb-2 px-1 md:px-2 text-yellow-400">60-80</th>
              <th className="text-center font-medium pb-2 px-1 md:px-2 text-emerald-400">&gt;80</th>
              <th className="text-center font-medium pb-2 px-1 md:px-2 text-muted-foreground">Sin examen</th>
            </tr>
          </thead>
          <tbody>
            {data.installations.map((r) => (
              <tr key={r.id} className="hover:bg-accent/20 transition-colors">
                <td className="py-1 md:py-1.5 pr-2 truncate max-w-[140px] md:max-w-[260px]" title={r.name}>
                  <Link href={`/ops/supervision/dashboard?installation=${r.id}`} className="hover:underline">
                    {r.name}
                  </Link>
                </td>
                <td className="text-center px-0.5 md:px-1 py-0.5 md:py-1">
                  <span
                    className="inline-block min-w-[40px] md:min-w-[54px] py-0.5 md:py-1 rounded font-bold tabular-nums text-foreground"
                    style={{ backgroundColor: avgColor(r.avg) }}
                  >
                    {r.avg == null ? '—' : `${r.avg}`}
                  </span>
                </td>
                <td className="text-center font-bold tabular-nums">{r.total}</td>
                <td className={`text-center tabular-nums ${r.below60 > 0 ? 'text-red-400 font-bold' : 'text-muted-foreground'}`}>{r.below60}</td>
                <td className="text-center tabular-nums text-muted-foreground">{r.between60_80}</td>
                <td className={`text-center tabular-nums ${r.above80 > 0 ? 'text-emerald-400' : 'text-muted-foreground'}`}>{r.above80}</td>
                <td className="text-center tabular-nums text-muted-foreground">{r.withoutExam}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
