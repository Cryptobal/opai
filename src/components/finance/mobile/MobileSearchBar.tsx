"use client";

/**
 * MobileSearchBar — barra de búsqueda sticky para mobile.
 *
 * Posición sticky al tope del listado (debajo del header global).
 * Botón "Filtros" opcional a la derecha con contador de filtros
 * activos, para abrir un FiltersDrawer/Sheet.
 *
 * El input usa h-11 (44px) para target táctil. Background neutro
 * y borde sutil para no competir con cards del listado.
 */

import { type ChangeEvent } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  /** Texto del botón filtros. */
  filtersLabel?: string;
  /** Si está presente, renderiza un botón de filtros con el badge contador. */
  onOpenFilters?: () => void;
  /** Contador de filtros activos para badge en el botón. */
  activeFiltersCount?: number;
  /** Si true, se pega al top del scroll container. */
  sticky?: boolean;
  className?: string;
  /** Sufijo opcional (ej: spinner cargando). */
  trailing?: React.ReactNode;
}

export function MobileSearchBar({
  value,
  onChange,
  placeholder = "Buscar…",
  filtersLabel = "Filtros",
  onOpenFilters,
  activeFiltersCount = 0,
  sticky = false,
  className,
  trailing,
}: Props) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 bg-background",
        sticky && "sticky top-0 z-10 -mx-4 px-4 py-2 border-b border-border/40",
        className,
      )}
    >
      <div className="relative flex-1 min-w-0">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ds-text-4 pointer-events-none"
          aria-hidden="true"
        />
        <input
          type="search"
          value={value}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            onChange(e.target.value)
          }
          placeholder={placeholder}
          aria-label={placeholder}
          className="h-11 w-full rounded-ds-md border border-border bg-ds-surface-1 pl-9 pr-3 text-[15px] text-ds-text-1 placeholder:text-ds-text-4 focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        {trailing ? (
          <span className="absolute right-2 top-1/2 -translate-y-1/2">
            {trailing}
          </span>
        ) : null}
      </div>
      {onOpenFilters ? (
        <button
          type="button"
          onClick={onOpenFilters}
          className="relative shrink-0 inline-flex items-center gap-1.5 h-11 px-3 rounded-ds-md border border-border bg-ds-surface-1 text-[13px] font-medium text-ds-text-1 active:bg-muted/40"
          aria-label={filtersLabel}
        >
          <SlidersHorizontal className="h-4 w-4" />
          <span>{filtersLabel}</span>
          {activeFiltersCount > 0 ? (
            <span className="ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-mono font-bold leading-none">
              {activeFiltersCount}
            </span>
          ) : null}
        </button>
      ) : null}
    </div>
  );
}
