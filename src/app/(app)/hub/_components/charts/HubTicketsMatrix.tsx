"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Info, ChevronRight } from 'lucide-react';
import { FORMULA_TOOLTIPS } from '../../_lib/hub-formula-tooltips';

interface InstRow {
  id: string;
  name: string;
  total: number;
  p1: number;
  p2: number;
  p3: number;
  p4: number;
  breached: number;
}
interface ApiResponse { success: boolean; installations: InstRow[]; }

const COL_HEADERS = [
  { key: 'total', label: 'Total', cls: 'text-foreground' },
  { key: 'p1', label: 'P1', cls: 'text-status-danger-fg' },
  { key: 'p2', label: 'P2', cls: 'text-status-warn-fg' },
  { key: 'p3', label: 'P3', cls: 'text-status-warn-fg' },
  { key: 'p4', label: 'P4', cls: 'text-status-info-fg' },
  { key: 'breached', label: 'SLA✗', cls: 'text-status-danger-fg' },
] as const;

function colorIntensity(value: number, max: number, hue: string): string {
  if (value <= 0) return 'rgba(255,255,255,0.04)';
  const i = max > 0 ? Math.min(value / max, 1) : 0;
  const alpha = 0.2 + i * 0.7;
  return `rgba(${hue},${alpha})`;
}

const HUE_BY_COL: Record<string, string> = {
  p1: '239,68,68',
  p2: '249,115,22',
  p3: '234,179,8',
  p4: '59,130,246',
  breached: '239,68,68',
};

export function HubTicketsMatrix() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showFormula, setShowFormula] = useState(false);

  useEffect(() => {
    fetch('/api/hub/tickets-heatmap')
      .then((r) => r.json())
      .then((j) => { setData(j); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-3 md:p-4">
        <p className="text-xs text-muted-foreground">Cargando matriz de tickets…</p>
      </div>
    );
  }
  if (!data?.success || data.installations.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground">Sin tickets activos por instalación.</p>
      </div>
    );
  }

  const max: Record<string, number> = {
    p1: 0, p2: 0, p3: 0, p4: 0, breached: 0,
  };
  for (const r of data.installations) {
    for (const k of Object.keys(max)) {
      max[k] = Math.max(max[k], (r as unknown as Record<string, number>)[k] ?? 0);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3 md:p-4">
      <div className="flex items-center justify-between mb-2 md:mb-3">
        <div className="flex items-center gap-1.5">
          <p className="text-xs md:text-sm font-semibold">Tickets activos por instalación</p>
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
          href="/ops/tickets"
          className="flex items-center gap-0.5 text-[10px] md:text-xs font-medium text-primary hover:underline"
        >
          Ver tickets
          <ChevronRight className="h-3 w-3" />
        </Link>
      </div>

      {showFormula && (
        <div className="mb-3 rounded-md border border-primary/30 bg-primary/5 p-2 text-[10px] md:text-xs text-muted-foreground">
          <span className="font-semibold text-primary">¿Cómo se calcula?</span>
          <p className="mt-1 whitespace-pre-line">{FORMULA_TOOLTIPS.ticketsMatrix}</p>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full text-[11px] md:text-sm">
          <thead>
            <tr className="text-muted-foreground border-b border-border">
              <th className="text-left font-medium pb-2 pr-2">Instalación</th>
              {COL_HEADERS.map((c) => (
                <th key={c.key} className={`text-center font-bold pb-2 px-1 md:px-2 ${c.cls}`}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.installations.map((row) => (
              <tr
                key={row.id}
                className="hover:bg-accent/20 cursor-pointer"
                onClick={() => {
                  if (row.id !== '__none__') {
                    window.location.href = `/ops/tickets?installation=${row.id}`;
                  }
                }}
              >
                <td className="py-1 md:py-1.5 pr-2 truncate max-w-[140px] md:max-w-[260px]" title={row.name}>
                  {row.name}
                </td>
                {COL_HEADERS.map((c) => {
                  const v = (row as unknown as Record<string, number>)[c.key];
                  // Columna "Total" se muestra como número plano (sin celda
                  // pintada blanca translúcida — antes era ilegible).
                  if (c.key === 'total') {
                    return (
                      <td
                        key={c.key}
                        className="text-center font-bold tabular-nums px-0.5 md:px-1 py-0.5 md:py-1"
                      >
                        <span className="inline-block min-w-[26px] md:min-w-[36px] py-0.5 md:py-1 text-foreground">
                          {v}
                        </span>
                      </td>
                    );
                  }
                  return (
                    <td
                      key={c.key}
                      className="text-center font-bold tabular-nums px-0.5 md:px-1 py-0.5 md:py-1"
                    >
                      <span
                        className="inline-block min-w-[26px] md:min-w-[36px] py-0.5 md:py-1 rounded"
                        style={{ backgroundColor: colorIntensity(v, max[c.key], HUE_BY_COL[c.key]) }}
                      >
                        {v}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
