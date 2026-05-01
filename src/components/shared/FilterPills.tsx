"use client";

import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export interface FilterOption {
  key: string;
  label: string;
  count?: number;
  icon?: LucideIcon;
  /** Variante de color cuando el filtro está activo (p. ej. "amber" para Borrador) */
  activeVariant?: "amber" | "blue" | "emerald" | "red";
}

interface FilterPillsProps {
  options: FilterOption[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
}

/**
 * Segmented filter — diseño consistente entre móvil y desktop.
 *
 * Inspirado en el patrón usado por el módulo Inventario: contenedor con
 * borde sutil + fondo elevado para el segmento activo. En móvil permite
 * scroll horizontal cuando hay muchos filtros (en lugar de truncarse en
 * un dropdown que esconde los conteos).
 */
export function FilterPills({ options, active, onChange, className }: FilterPillsProps) {
  return (
    <div
      role="tablist"
      aria-label="Filtros"
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-muted/40 p-1",
        "overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {options.map((opt) => {
        const Icon = opt.icon;
        const isActive = active === opt.key;
        const activeBg =
          opt.activeVariant === "amber"
            ? "bg-status-warn-soft text-status-warn-fg dark:text-status-warn-fg"
            : opt.activeVariant === "blue"
              ? "bg-status-info-soft text-blue-700 dark:text-status-info-fg"
              : opt.activeVariant === "emerald"
                ? "bg-status-ok-soft text-status-ok-fg dark:text-status-ok-fg"
                : opt.activeVariant === "red"
                  ? "bg-status-danger-soft text-status-danger-fg dark:text-status-danger-fg"
                  : "bg-background text-foreground";
        return (
          <button
            key={opt.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(opt.key)}
            className={cn(
              "relative inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded px-2.5 py-1.5 text-xs font-medium",
              "transition-colors duration-200 ease-[cubic-bezier(0.2,0,0,1)]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background",
              isActive
                ? `${activeBg} shadow-sm`
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {Icon && <Icon className="h-3.5 w-3.5" />}
            <span>{opt.label}</span>
            {opt.count !== undefined && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0 text-[10px] font-semibold tabular-nums leading-[1.4]",
                  isActive
                    ? "bg-foreground/10 text-current"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
