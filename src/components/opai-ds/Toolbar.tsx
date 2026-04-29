"use client";

/**
 * OPAI DS v3 — Toolbar
 *
 * Barra superior estandarizada de cualquier listado: search + filtros pill +
 * sort + view toggle + actions. Mobile-first: search arriba ocupando 100%,
 * controles abajo en fila scrollable horizontal.
 *
 * Reemplaza al ListToolbar existente cuando se aplique en inventario.
 */

import { ReactNode, useState } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ToolbarProps {
  /** Search controlado. */
  search?: string;
  onSearchChange?: (v: string) => void;
  searchPlaceholder?: string;

  /** Slot izquierdo entre search y actions (filtros, view toggle, etc.). */
  controls?: ReactNode;

  /** Botón principal a la derecha. */
  primaryAction?: ReactNode;

  className?: string;
}

export function Toolbar({
  search,
  onSearchChange,
  searchPlaceholder = "Buscar…",
  controls,
  primaryAction,
  className,
}: ToolbarProps) {
  const [focused, setFocused] = useState(false);
  const showClear = search && search.length > 0;

  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-center", className)}>
      {/* Search */}
      {onSearchChange && (
        <div
          className={cn(
            "relative flex-1 sm:max-w-md transition-all duration-fast",
          )}
        >
          <Search className={cn(
            "absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors",
            focused ? "text-primary" : "text-ds-text-4",
          )} />
          <input
            type="text"
            value={search ?? ""}
            onChange={(e) => onSearchChange(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={searchPlaceholder}
            className={cn(
              "h-11 sm:h-10 w-full rounded-ds-md bg-ds-surface-1 px-9 text-[15px] sm:text-sm text-ds-text-1 placeholder:text-ds-text-4",
              "border border-ds-border-default transition-colors",
              "focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20",
            )}
          />
          {showClear && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ds-text-4 hover:text-ds-text-2"
              aria-label="Limpiar búsqueda"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {/* Controls + action */}
      <div className="flex items-center gap-2 min-w-0">
        {controls && (
          <div className="flex items-center gap-1.5 min-w-0 flex-1 sm:flex-initial overflow-x-auto ds-scroll-x">
            {controls}
          </div>
        )}
        {primaryAction && <div className="shrink-0">{primaryAction}</div>}
      </div>
    </div>
  );
}
