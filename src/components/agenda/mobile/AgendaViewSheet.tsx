"use client";

import { Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { addMonthsYmd, monthTitle, type AgendaMobileView } from "./agenda-mobile-utils";

const VIEWS: Array<{ id: AgendaMobileView; label: string; hint: string }> = [
  { id: "agenda", label: "Agenda", hint: "Lista por día" },
  { id: "day", label: "Día", hint: "Horario de un día" },
  { id: "month", label: "Mes", hint: "Calendario mensual" },
];

type Props = {
  open: boolean;
  view: AgendaMobileView;
  selectedYmd: string;
  onViewChange: (view: AgendaMobileView) => void;
  onSelectDate: (ymd: string) => void;
  onClose: () => void;
};

/**
 * Sheet de vista/mes (v3.1): abierto al tocar el mes en el header. Permite
 * navegar meses (‹ Julio 2026 ›) y elegir la vista Agenda/Día/Mes, sacando el
 * segmented del chrome fijo para comprimirlo (~208px → ~104px).
 */
export function AgendaViewSheet({ open, view, selectedYmd, onViewChange, onSelectDate, onClose }: Props) {
  if (!open) return null;
  const { month, year } = monthTitle(selectedYmd);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Vista y mes"
        className="w-full max-w-md space-y-3 rounded-t-2xl border-t border-ds-border-subtle bg-ds-surface-1 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto h-1 w-10 rounded-full bg-ds-surface-3" />

        <div className="flex items-center justify-between">
          <p className="font-display text-ds-title font-semibold text-ds-text-1">Vista</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="grid h-9 w-9 place-items-center rounded-lg text-ds-text-3 ds-tap"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navegación de meses. */}
        <div className="flex items-center justify-between rounded-xl bg-ds-surface-2 p-1">
          <button
            type="button"
            onClick={() => onSelectDate(addMonthsYmd(selectedYmd, -1))}
            aria-label="Mes anterior"
            className="grid h-11 w-11 place-items-center rounded-lg text-ds-text-2 ds-tap"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <p className="font-display text-[15px] font-semibold text-ds-text-1">
            {month} <span className="font-mono text-ds-body font-normal text-ds-text-3">{year}</span>
          </p>
          <button
            type="button"
            onClick={() => onSelectDate(addMonthsYmd(selectedYmd, 1))}
            aria-label="Mes siguiente"
            className="grid h-11 w-11 place-items-center rounded-lg text-ds-text-2 ds-tap"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {/* Vistas. */}
        <div className="space-y-1">
          {VIEWS.map((v) => {
            const active = view === v.id;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => onViewChange(v.id)}
                aria-pressed={active}
                className={cn(
                  "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left ds-tap",
                  active ? "bg-primary/10" : "hover:bg-ds-surface-2",
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className={cn("text-[14px] font-medium", active ? "text-primary" : "text-ds-text-1")}>
                    {v.label}
                  </p>
                  <p className="text-[12px] text-ds-text-3">{v.hint}</p>
                </div>
                {active && <Check className="h-4 w-4 shrink-0 text-primary" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
