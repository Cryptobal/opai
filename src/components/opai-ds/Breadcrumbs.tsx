"use client";

/**
 * OPAI DS v3 — Breadcrumbs
 *
 * Navegación contextual con separador chevron. Reemplaza al legacy
 * components/opai/Breadcrumb.tsx con tokens DS directos.
 *
 * Mobile: si hay >3 niveles, colapsa el medio mostrando "…" clickeable
 * que abre un dropdown con los niveles ocultos. Última crumb siempre
 * visible. Primera crumb visible cuando ayuda al contexto.
 */

import Link from "next/link";
import { Fragment, useState } from "react";
import { ChevronRight, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
  /** Cuántas crumbs mantener visibles a cada lado en mobile. Default: 1 (primera + última). */
  keepEdgeOnMobile?: number;
}

export function Breadcrumbs({
  items,
  className,
  keepEdgeOnMobile = 1,
}: BreadcrumbsProps) {
  const [expanded, setExpanded] = useState(false);

  if (!items.length) return null;

  const total = items.length;
  const collapseInMobile = total > 3;
  const middleStart = keepEdgeOnMobile;
  const middleEnd = total - keepEdgeOnMobile;
  const middle = items.slice(middleStart, middleEnd);

  return (
    <nav aria-label="Breadcrumb" className={cn("flex items-center text-sm", className)}>
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((item, index) => {
          const isLast = index === total - 1;
          const isInMiddle = index >= middleStart && index < middleEnd;
          const showInMobile = !collapseInMobile || !isInMiddle || expanded;

          return (
            <Fragment key={`${item.label}-${index}`}>
              <li
                className={cn(
                  "flex items-center gap-1",
                  showInMobile ? "" : "hidden md:flex",
                )}
              >
                {item.href ? (
                  <Link
                    href={item.href}
                    aria-current={isLast ? "page" : undefined}
                    className={cn(
                      "transition-colors duration-150 hover:underline underline-offset-4 decoration-2",
                      isLast
                        ? "text-primary font-semibold hover:text-primary/80"
                        : "text-ds-text-3 hover:text-ds-text-1",
                    )}
                  >
                    {item.label}
                  </Link>
                ) : (
                  <span
                    aria-current={isLast ? "page" : undefined}
                    className={cn(
                      isLast ? "text-primary font-semibold" : "text-ds-text-3",
                    )}
                  >
                    {item.label}
                  </span>
                )}
                {!isLast && (
                  <ChevronRight
                    aria-hidden
                    className="h-3.5 w-3.5 text-ds-text-4 shrink-0"
                  />
                )}
              </li>

              {/* Botón "…" colapsado: aparece justo antes del primer middle item */}
              {collapseInMobile &&
                !expanded &&
                index === middleStart - 1 &&
                middle.length > 0 && (
                  <li className="md:hidden flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setExpanded(true)}
                      className="inline-flex items-center justify-center rounded-md p-1 text-ds-text-3 hover:text-ds-text-1 hover:bg-ds-surface-2 transition-colors duration-150"
                      aria-label="Mostrar niveles ocultos"
                      title={middle.map((m) => m.label).join(" / ")}
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </button>
                    <ChevronRight
                      aria-hidden
                      className="h-3.5 w-3.5 text-ds-text-4 shrink-0"
                    />
                  </li>
                )}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
