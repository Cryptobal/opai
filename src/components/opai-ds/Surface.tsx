"use client";

/**
 * OPAI DS v3 — Surface
 *
 * 5 niveles de elevación con tokens semánticos. Reemplaza a OpaiSurface
 * y card-mock cuando se aplique en un módulo. El consumidor decide la
 * elevación según el contexto, no el componente.
 *
 * Niveles:
 *   0 = page background (rara vez se usa explícito)
 *   1 = card primaria (default)
 *   2 = card elevada / popover
 *   3 = sticky / dialog
 *   4 = menu / tooltip
 *
 * Variantes:
 *   default — bg + border + shadow-xs
 *   bare    — sin padding, sin shadow (caller controla)
 *   inline  — sin padding-x, conserva border + shadow (para "estado dentro de fila")
 */

import { ReactNode, forwardRef, HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Elevation = 1 | 2 | 3 | 4;
type Padding = "none" | "sm" | "md" | "lg";

const ELEVATION_BG: Record<Elevation, string> = {
  1: "bg-ds-surface-1",
  2: "bg-ds-surface-2",
  3: "bg-ds-surface-3",
  4: "bg-ds-surface-4",
};

const ELEVATION_SHADOW: Record<Elevation, string> = {
  1: "shadow-ds-xs",
  2: "shadow-ds-sm",
  3: "shadow-ds-md",
  4: "shadow-ds-lg",
};

const PADDING: Record<Padding, string> = {
  none: "",
  sm: "p-3 sm:p-3.5",
  md: "p-4 sm:p-5",
  lg: "p-5 sm:p-6",
};

export interface SurfaceProps extends HTMLAttributes<HTMLDivElement> {
  elevation?: Elevation;
  padding?: Padding;
  /** Hover lift effect — solo en desktop. */
  hoverable?: boolean;
  /** Press feedback (mobile). */
  tappable?: boolean;
  /** Extender border en estado activo / seleccionado. */
  selected?: boolean;
  /** Ocultar shadow (cards anidadas). */
  flat?: boolean;
  children: ReactNode;
}

export const Surface = forwardRef<HTMLDivElement, SurfaceProps>(
  (
    {
      elevation = 1,
      padding = "md",
      hoverable = false,
      tappable = false,
      selected = false,
      flat = false,
      className,
      children,
      ...rest
    },
    ref,
  ) => {
    return (
      <div
        ref={ref}
        className={cn(
          // base
          "rounded-ds-lg border border-ds-border-default",
          ELEVATION_BG[elevation],
          !flat && ELEVATION_SHADOW[elevation],
          PADDING[padding],
          // states
          selected && "border-primary/50 ring-1 ring-primary/30",
          hoverable &&
            "transition-colors duration-fast hover:border-ds-border-strong hover:bg-ds-surface-2",
          tappable && "ds-tap cursor-pointer",
          className,
        )}
        {...rest}
      >
        {children}
      </div>
    );
  },
);
Surface.displayName = "Surface";
