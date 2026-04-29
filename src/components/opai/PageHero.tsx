"use client";

/**
 * OpaiPageHero — header estandarizado para páginas tipo "war room"
 *
 * Inspirado en el módulo de Conocimiento. Reutilizable en cualquier módulo.
 *
 * Variantes visuales:
 *   - showBlob (default true): un único blob suave a la izquierda
 *   - grain (default true): grain-overlay sutil
 *
 * Componer con `card-mock` (definido en globals.css) para las secciones de
 * contenido y mantener el lenguaje visual unificado.
 */

import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface OpaiPageHeroProps {
  /** Breadcrumb opcional (ej. ["Operaciones", "Inventario"]). Visible en mono. */
  eyebrow?: string[] | string;
  /** Título principal. Renderizado con font-display. */
  title: string;
  /** Sub-título suave (atenuado en text-foreground/40). */
  subtitle?: string;
  /** Descripción debajo del título. */
  description?: ReactNode;
  /** Acciones del header (botones), alineadas a la derecha en sm+. */
  actions?: ReactNode;
  /** Mostrar el blob decorativo a la izquierda (suave). Default: true. */
  showBlob?: boolean;
  /** Color del blob. Default: brand. */
  blobColor?: "brand" | "ok" | "warn" | "danger";
  /** Mostrar grain overlay sutil. Default: true. */
  grain?: boolean;
  /** className extra para el header. */
  className?: string;
}

const BLOB_BG: Record<NonNullable<OpaiPageHeroProps["blobColor"]>, string> = {
  brand: "bg-brand",
  ok: "bg-emerald-500",
  warn: "bg-amber-500",
  danger: "bg-red-500",
};

export function OpaiPageHero({
  eyebrow,
  title,
  subtitle,
  description,
  actions,
  showBlob = true,
  blobColor = "brand",
  grain = true,
  className,
}: OpaiPageHeroProps) {
  const eyebrowArray = Array.isArray(eyebrow) ? eyebrow : eyebrow ? [eyebrow] : [];

  return (
    <header
      className={cn(
        "relative isolate w-full",
        grain && "grain-overlay",
        className,
      )}
    >
      {showBlob && (
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute -top-12 -left-24 h-64 w-64 rounded-full blur-3xl opacity-25 dark:opacity-30",
            BLOB_BG[blobColor],
          )}
        />
      )}

      {eyebrowArray.length > 0 && (
        <div className="relative flex items-center gap-1.5 text-[11px] text-muted-foreground/70 font-mono mb-3">
          {eyebrowArray.map((part, i) => (
            <span key={`${part}-${i}`} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-muted-foreground/30">/</span>}
              <span className={cn(i === eyebrowArray.length - 1 ? "text-foreground/80" : "")}>
                {part}
              </span>
            </span>
          ))}
        </div>
      )}

      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-2xl md:text-3xl font-bold leading-tight tracking-tight">
            {title}
            {subtitle && (
              <>
                <br />
                <span className="text-foreground/40">{subtitle}</span>
              </>
            )}
          </h1>
          {description && (
            <p className="text-[13px] text-muted-foreground mt-2 leading-relaxed max-w-2xl">
              {description}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>
        )}
      </div>
    </header>
  );
}
