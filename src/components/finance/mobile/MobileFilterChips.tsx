"use client";

/**
 * MobileFilterChips — strip horizontal scrollable de chips de filtro.
 *
 * Pensado para mostrar el estado de filtros en mobile sin ocupar
 * vertical (que se va al listado). El primer chip suele ser
 * "Filtros" abriendo el FiltersDrawer; los siguientes representan
 * el valor activo de cada filtro (clickeables para quitarlos).
 *
 * Sin overflow horizontal en el contenedor — usa scrollbar-hide.
 */

import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface MobileFilterChip {
  key: string;
  label: ReactNode;
  /** Tono visual. */
  tone?: "default" | "active" | "muted";
  /** Si se pasa, el chip muestra una X que dispara onClear. */
  onClear?: () => void;
  onClick?: () => void;
  /** Icono opcional al inicio del chip. */
  leadingIcon?: ReactNode;
}

interface Props {
  chips: MobileFilterChip[];
  /** Clase extra para el contenedor (ej: para hacerlo sticky). */
  className?: string;
  /** Si true, agrega padding lateral negativo para alinear con padding del padre. */
  bleedX?: boolean;
}

export function MobileFilterChips({ chips, className, bleedX = false }: Props) {
  if (chips.length === 0) return null;
  return (
    <div
      className={cn(
        "flex gap-2 overflow-x-auto scrollbar-hide pb-1",
        bleedX && "-mx-4 px-4",
        className,
      )}
      role="group"
      aria-label="Filtros activos"
    >
      {chips.map((c) => {
        const isClickable = Boolean(c.onClick);
        const toneCls =
          c.tone === "active"
            ? "bg-primary text-primary-foreground border-transparent"
            : c.tone === "muted"
              ? "bg-muted/30 text-ds-text-3 border-border/40"
              : "bg-ds-surface-1 text-ds-text-1 border-border";
        return (
          <span
            key={c.key}
            className={cn(
              "shrink-0 h-9 inline-flex items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium whitespace-nowrap",
              toneCls,
              isClickable && "cursor-pointer active:opacity-80",
            )}
            onClick={c.onClick}
            role={isClickable ? "button" : undefined}
            tabIndex={isClickable ? 0 : undefined}
            onKeyDown={
              isClickable
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      c.onClick?.();
                    }
                  }
                : undefined
            }
          >
            {c.leadingIcon ? (
              <span className="shrink-0 inline-flex items-center">
                {c.leadingIcon}
              </span>
            ) : null}
            <span className="truncate max-w-[160px]">{c.label}</span>
            {c.onClear ? (
              <button
                type="button"
                aria-label="Quitar filtro"
                onClick={(e) => {
                  e.stopPropagation();
                  c.onClear?.();
                }}
                className="shrink-0 -mr-1 inline-flex items-center justify-center h-5 w-5 rounded-full hover:bg-ds-surface-3"
              >
                <span className="text-[14px] leading-none">×</span>
              </button>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}
