"use client";

/**
 * OPAI DS v3 — SegmentedControl
 *
 * Segmentado de ESTADO (no de navegación). Complementa a `SwipeTabs`/`SubNav`,
 * que navegan por `href`: acá el cambio de segmento es puro estado del cliente
 * (vista rápida, filtro excluyente, modo de lista).
 *
 * Contrato visual de la superficie Productividad: el segmento activo usa
 * `bg-primary text-primary-foreground`; el contenedor es `bg-ds-surface-1`
 * con `border-ds-border-default`. En móvil la fila scrollea horizontalmente
 * sin scrollbar visible.
 */

import { cn } from "@/lib/utils";

export interface SegmentedControlItem<T extends string = string> {
  id: T;
  label: string;
  /** Conteo opcional. Si es `undefined` no se renderiza (counts nulos). */
  count?: number | null;
  icon?: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
  /** Tooltip nativo — útil para explicar por qué está deshabilitado. */
  title?: string;
}

export interface SegmentedControlProps<T extends string = string> {
  items: SegmentedControlItem<T>[];
  value: T;
  onChange: (id: T) => void;
  size?: "xs" | "sm" | "md";
  /** Etiqueta accesible del grupo. */
  ariaLabel?: string;
  className?: string;
}

const SIZE = {
  xs: { seg: "h-6 px-2 text-[12px] gap-1", pad: "p-0.5", icon: "h-3 w-3" },
  sm: { seg: "h-8 px-2.5 text-[12px] gap-1.5", pad: "p-1", icon: "h-3.5 w-3.5" },
  md: { seg: "h-10 sm:h-9 px-3 text-[13px] gap-1.5", pad: "p-1", icon: "h-4 w-4" },
} as const;

export function SegmentedControl<T extends string = string>({
  items,
  value,
  onChange,
  size = "sm",
  ariaLabel,
  className,
}: SegmentedControlProps<T>) {
  if (items.length === 0) return null;
  const s = SIZE[size];

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex min-w-0 max-w-full items-center overflow-x-auto rounded-full border border-ds-border-default bg-ds-surface-1",
        // Scroll horizontal en móvil sin scrollbar visible (momentum iOS).
        "[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
        "touch-pan-x overscroll-x-contain",
        s.pad,
        className,
      )}
    >
      {items.map((item) => {
        const isActive = item.id === value;
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            disabled={item.disabled}
            title={item.title}
            onClick={() => onChange(item.id)}
            className={cn(
              "inline-flex shrink-0 items-center justify-center rounded-full font-medium",
              "transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40",
              s.seg,
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-ds-text-3 hover:bg-ds-surface-2 hover:text-ds-text-1",
            )}
          >
            {Icon && <Icon className={cn(s.icon, "shrink-0")} aria-hidden />}
            {/* min-w-0 + truncate: en iPad con dos paneles preferimos truncar
                el label antes que desbordar la toolbar. */}
            <span className="min-w-0 truncate">{item.label}</span>
            {typeof item.count === "number" && (
              <span
                className={cn(
                  "tabular-nums",
                  isActive ? "opacity-80" : "text-ds-text-4",
                )}
              >
                {item.count > 999 ? "999+" : item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
