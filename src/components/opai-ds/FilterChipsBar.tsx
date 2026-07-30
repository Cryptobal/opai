"use client";

/**
 * OPAI DS v3 — FilterChipsBar
 *
 * Barra de filtros activos removibles. Extraída del patrón `activeChips`
 * de Tickets (`TicketsClient`), donde cada chip ya traía su propio `onClear`.
 * El consumidor sigue siendo dueño del estado: esta primitiva solo pinta.
 *
 * Renderiza `null` cuando no hay chips, así el call site puede montarla
 * incondicionalmente sin ensuciar el layout con un contenedor vacío.
 */

import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FilterChip {
  key: string;
  label: string;
  onClear: () => void;
}

export interface FilterChipsBarProps {
  chips: FilterChip[];
  /** Muestra "Limpiar todo" al final de la fila. */
  onClearAll?: () => void;
  clearAllLabel?: string;
  className?: string;
}

export function FilterChipsBar({
  chips,
  onClearAll,
  clearAllLabel = "Limpiar todo",
  className,
}: FilterChipsBarProps) {
  if (chips.length === 0) return null;

  return (
    <div
      className={cn("flex flex-wrap items-center gap-1.5", className)}
      role="group"
      aria-label="Filtros activos"
    >
      {chips.map((chip) => (
        <span
          key={chip.key}
          className="inline-flex items-center gap-1 rounded-full border border-ds-border-default bg-ds-surface-2 px-2 py-0.5 text-[12px] text-ds-text-2"
        >
          {chip.label}
          <button
            type="button"
            onClick={chip.onClear}
            aria-label={`Quitar filtro ${chip.label}`}
            className="rounded-full p-0.5 text-ds-text-3 transition-colors hover:text-ds-text-1"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      {onClearAll && (
        <button
          type="button"
          onClick={onClearAll}
          className="text-[12px] text-ds-text-3 transition-colors hover:text-ds-text-1"
        >
          {clearAllLabel}
        </button>
      )}
    </div>
  );
}
