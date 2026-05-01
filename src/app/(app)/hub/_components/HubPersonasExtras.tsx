"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { UserPlus, Cake, ArrowUp, ArrowDown, Info } from 'lucide-react';
import { FORMULA_TOOLTIPS } from '../_lib/hub-formula-tooltips';

interface ApiResponse {
  success: boolean;
  postulantes: { thisWeek: number; prevWeek: number; delta: number; inProcess: number };
  cumples: {
    guardiaId: string;
    name: string;
    installationId: string | null;
    installationName: string | null;
    date: string;
    age: number;
  }[];
}

const fmtMonthDay = (s: string) => {
  const [, m, d] = s.split('-');
  const monthNames = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return `${parseInt(d, 10)} ${monthNames[parseInt(m, 10) - 1]}`;
};

export function HubPersonasExtras() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showFormulaPostulantes, setShowFormulaPostulantes] = useState(false);

  useEffect(() => {
    fetch('/api/hub/personas-extras')
      .then((r) => r.json())
      .then((j) => { setData(j); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading || !data?.success) return null;
  const { postulantes, cumples } = data;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
      {/* Postulantes semana */}
      <Link
        href="/ops/ats"
        className="rounded-lg border border-border bg-card p-3 md:p-4 hover:ring-2 hover:ring-primary/25 transition-all"
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-primary" />
            <p className="text-xs md:text-sm font-semibold">Postulantes esta semana</p>
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowFormulaPostulantes((s) => !s); }}
              className="text-primary/70 hover:text-primary"
              aria-label="Cómo se calcula"
            >
              <Info className="h-4 w-4" />
            </button>
          </div>
          {postulantes.delta !== 0 && (
            <div className={`flex items-center gap-0.5 text-[11px] font-medium ${postulantes.delta > 0 ? 'text-status-ok-fg' : 'text-status-danger-fg'}`}>
              {postulantes.delta > 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
              {Math.abs(postulantes.delta)}%
            </div>
          )}
        </div>
        {showFormulaPostulantes && (
          <p className="mb-2 rounded-md border border-primary/30 bg-primary/5 p-2 text-[10px] text-muted-foreground whitespace-pre-line">
            {FORMULA_TOOLTIPS.postulantesSemana}
          </p>
        )}
        <div className="flex items-end justify-between">
          <div>
            <p className="text-2xl md:text-3xl font-bold tabular-nums">{postulantes.thisWeek}</p>
            <p className="text-[10px] md:text-[11px] text-muted-foreground">
              vs {postulantes.prevWeek} la semana pasada
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs md:text-sm font-medium tabular-nums">{postulantes.inProcess}</p>
            <p className="text-[10px] text-muted-foreground">en proceso</p>
          </div>
        </div>
      </Link>

      {/* Cumpleaños */}
      <div className="rounded-lg border border-border bg-card p-3 md:p-4">
        <div className="flex items-center gap-2 mb-2">
          <Cake className="h-4 w-4 text-pink-400" />
          <p className="text-xs md:text-sm font-semibold">Cumpleaños esta semana</p>
        </div>
        {cumples.length === 0 ? (
          <p className="text-xs text-muted-foreground">Ninguno en los próximos 7 días.</p>
        ) : (
          <ul className="space-y-1 max-h-40 overflow-y-auto">
            {cumples.map((c) => (
              <li key={c.guardiaId} className="flex items-center justify-between gap-2 text-[11px] md:text-xs">
                <Link
                  href={`/personas/guardias/${c.guardiaId}`}
                  className="truncate hover:underline flex-1"
                >
                  <span className="font-medium">{c.name}</span>
                  {c.installationName && (
                    <span className="text-muted-foreground"> · {c.installationName}</span>
                  )}
                </Link>
                <span className="text-muted-foreground tabular-nums whitespace-nowrap">
                  {fmtMonthDay(c.date)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
