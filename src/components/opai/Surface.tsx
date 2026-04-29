"use client";

/**
 * OpaiSurface — superficie estandarizada estilo "war room"
 *
 * Reemplaza al `<Card>` shadcn cuando el módulo está en lenguaje war room
 * (módulo Conocimiento, módulo Inventario rediseñado). Respeta light y dark
 * mode usando tokens del design system, y su look está alineado con `card-mock`
 * de globals.css.
 *
 * Variantes:
 *   - default: padding 4 (16px), borde sutil + degradé.
 *   - tight:   padding 3 (12px), bordes más finos.
 *   - bare:    sin padding (lo controla el caller).
 *
 * Uso:
 *   <OpaiSurface>...</OpaiSurface>
 *   <OpaiSurface variant="tight" hoverable>...</OpaiSurface>
 */

import { ReactNode, forwardRef, HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "default" | "tight" | "bare";

const VARIANT_PADDING: Record<Variant, string> = {
  default: "p-3 sm:p-4",
  tight: "p-2.5",
  bare: "",
};

const BASE_CLASSES =
  // Borde y radio comunes
  "rounded-2xl border border-foreground/[0.06] " +
  // Fondo: degradé translúcido sobre el background del tema
  "bg-[linear-gradient(180deg,rgba(127,127,127,0.04),rgba(127,127,127,0.015))] " +
  "dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.025),rgba(255,255,255,0.012))]";

const HOVER_CLASSES =
  "transition-colors hover:border-foreground/15 hover:bg-foreground/[0.02] dark:hover:bg-white/[0.04]";

export interface OpaiSurfaceProps extends HTMLAttributes<HTMLDivElement> {
  variant?: Variant;
  hoverable?: boolean;
  children: ReactNode;
}

export const OpaiSurface = forwardRef<HTMLDivElement, OpaiSurfaceProps>(
  ({ variant = "default", hoverable = false, className, children, ...rest }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          BASE_CLASSES,
          VARIANT_PADDING[variant],
          hoverable && HOVER_CLASSES,
          variant === "tight" && "rounded-xl",
          className,
        )}
        {...rest}
      >
        {children}
      </div>
    );
  },
);
OpaiSurface.displayName = "OpaiSurface";

/* ──────────────────────────────────────────────────────────────────
 * OpaiSectionHeader — título + descripción + actions estandarizado
 * para encabezados internos de sección (dentro de un OpaiSurface).
 * ────────────────────────────────────────────────────────────────── */

export interface OpaiSectionHeaderProps {
  title: string;
  /** Bajada en font-mono atenuada (estilo war room). */
  hint?: ReactNode;
  /** Botón / link a la derecha. */
  actions?: ReactNode;
  className?: string;
}

export function OpaiSectionHeader({ title, hint, actions, className }: OpaiSectionHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between gap-3 mb-3", className)}>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {hint && (
          <p className="text-[11px] text-muted-foreground/70 font-mono mt-0.5">
            {hint}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
