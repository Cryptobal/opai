"use client";

/**
 * OPAI DS v3 — PageHero
 *
 * Reemplaza a OpaiPageHero. Diferencias:
 *  - Sin grain overlay ni blob (eran ruido visual).
 *  - Tipografía display más fuerte (Outfit Variable funcionando real).
 *  - Eyebrow en monospace con separador "/" sutil.
 *  - Title con subtitle como continuación (segunda línea atenuada).
 *  - Opcional: IconTile xl a la izquierda (icon + iconVariant | iconTone).
 */

import { ReactNode, type ReactElement } from "react";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconTile, type IconBubbleVariant, type IconBubbleTone } from "./IconBubble";

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
  /**
   * Ícono Lucide para IconTile xl a la izquierda del título. Acepta el
   * componente o el elemento ya renderizado (`<Icon />`). Server
   * Components DEBEN pasar el elemento renderizado para evitar errores
   * de serialización RSC (los lucide icons son `forwardRef`).
   */
  icon?: LucideIcon | ReactElement;
  /** Variante semántica del IconTile. Ignorada si `iconTone` está definido. */
  iconVariant?: IconBubbleVariant;
  /** Tono categórico del IconTile (ej: "emerald" para Inventario). */
  iconTone?: IconBubbleTone;
  className?: string;
}

export function PageHero({
  eyebrow,
  title,
  subtitle,
  description,
  actions,
  icon,
  iconVariant = "brand",
  iconTone,
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
        <div className="flex items-start gap-4 min-w-0">
          {icon && (
            <IconTile
              icon={icon}
              variant={iconVariant}
              tone={iconTone}
              size="xl"
              className="mt-1 hidden sm:inline-flex"
            />
          )}
          <div className="min-w-0">
            {icon && (
              <IconTile
                icon={icon}
                variant={iconVariant}
                tone={iconTone}
                size="lg"
                className="sm:hidden mb-3"
              />
            )}
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
