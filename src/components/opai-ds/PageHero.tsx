"use client";

/**
 * OPAI DS v3 — PageHero
 *
 * Reemplaza a OpaiPageHero. Diferencias:
 *  - Sin grain overlay ni blob (eran ruido visual).
 *  - Tipografía display más fuerte (Outfit Variable funcionando real).
 *  - Eyebrow en monospace con separador "/" sutil.
 *  - Title con subtitle como continuación (segunda línea atenuada).
 */

import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface PageHeroProps {
  /** Breadcrumb opcional, ej. ["Operaciones", "Inventario"]. */
  eyebrow?: string[] | string;
  title: string;
  /** Segunda línea del título, atenuada. */
  subtitle?: string;
  /** Descripción debajo del título. */
  description?: ReactNode;
  /** Botones / actions a la derecha. */
  actions?: ReactNode;
  className?: string;
}

export function PageHero({
  eyebrow,
  title,
  subtitle,
  description,
  actions,
  className,
}: PageHeroProps) {
  const eyebrowParts = Array.isArray(eyebrow) ? eyebrow : eyebrow ? [eyebrow] : [];

  return (
    <header className={cn("relative w-full", className)}>
      {eyebrowParts.length > 0 && (
        <nav
          aria-label="breadcrumb"
          className="mb-3 flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-4"
        >
          {eyebrowParts.map((part, i) => (
            <span key={`${part}-${i}`} className="flex items-center gap-1.5">
              {i > 0 && <span aria-hidden className="text-ds-text-4/60">/</span>}
              <span
                className={i === eyebrowParts.length - 1 ? "text-ds-text-2" : ""}
              >
                {part}
              </span>
            </span>
          ))}
        </nav>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-3xl sm:text-4xl font-bold leading-[1.05] tracking-tight text-ds-text-1">
            {title}
            {subtitle && (
              <>
                <br />
                <span className="text-ds-text-4 font-medium">{subtitle}</span>
              </>
            )}
          </h1>
          {description && (
            <p className="mt-3 text-[14px] sm:text-[15px] leading-relaxed text-ds-text-3 max-w-2xl">
              {description}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}
