"use client";

import { X } from "lucide-react";

export type BitacoraFiltro =
  | "todos"
  | "rondas"
  | "marcaciones"
  | "tickets"
  | "supervision"
  | "incidentes";

const CHIPS: Array<{ value: BitacoraFiltro; label: string }> = [
  { value: "todos", label: "Todos" },
  { value: "rondas", label: "Rondas" },
  { value: "marcaciones", label: "Marcaciones" },
  { value: "tickets", label: "Tickets" },
  { value: "supervision", label: "Supervisión" },
  { value: "incidentes", label: "Incidentes" },
];

interface Props {
  filtro: BitacoraFiltro;
  onFiltro: (f: BitacoraFiltro) => void;
  days: number;
  onDays: (d: number) => void;
}

export function BitacoraFiltros({ filtro, onFiltro, days, onDays }: Props) {
  return (
    <div className="sticky top-0 z-10 bg-zinc-950/95 backdrop-blur -mx-4 px-4 py-2 border-b border-white/[0.06] mb-3 opai-ios-surface-sheet-top">
      <div className="flex gap-1 overflow-x-auto scrollbar-none mb-2">
        {CHIPS.map((c) => {
          const active = filtro === c.value;
          return (
            <button
              key={c.value}
              onClick={() => onFiltro(c.value)}
              className={`whitespace-nowrap text-xs px-3 py-1 rounded-full border transition-colors ${
                active
                  ? "bg-status-info-soft border-status-info-border text-status-info-fg"
                  : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700"
              }`}
            >
              {c.label}
              {active && c.value !== "todos" && (
                <X className="inline h-3 w-3 ml-1 -mt-0.5" />
              )}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-1.5">
        {[7, 30, 90].map((d) => (
          <button
            key={d}
            onClick={() => onDays(d)}
            className={`text-[11px] px-2.5 py-1 rounded-full border ${
              days === d
                ? "bg-status-info-soft border-status-info-border text-status-info-fg"
                : "bg-zinc-900 border-zinc-800 text-zinc-400"
            }`}
          >
            {d}d
          </button>
        ))}
      </div>
    </div>
  );
}
