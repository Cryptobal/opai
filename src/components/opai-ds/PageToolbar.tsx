"use client";

/**
 * OPAI DS v3 — PageToolbar
 *
 * Fila de acciones de página que reemplaza al patrón `PageHero.actions`.
 * En nav-limpia-v1 las páginas ya no llevan hero: el primer elemento útil es
 * esta barra (o el contenido directo). Agrupa, de izquierda a derecha:
 *
 *   [ search ] [ filters (chips) ] ……… [ trailing ] [ primaryAction ] [ ? ]
 *
 * Todos los slots son opcionales. `helpText` migra la "bajada" descriptiva
 * del viejo hero a un tooltip discreto (regla §5 del brief). Solo tokens DS.
 */

import { type ReactNode } from "react";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface PageToolbarProps {
  /** Input de búsqueda (a la izquierda, crece en móvil). */
  search?: ReactNode;
  /** Chips / segmented de filtros. */
  filters?: ReactNode;
  /** Botones secundarios (export, refrescar, …) antes de la acción primaria. */
  trailing?: ReactNode;
  /** Acción primaria de la página (ej. "Nuevo"). */
  primaryAction?: ReactNode;
  /** Texto de ayuda opcional → tooltip "?" al final de la fila. */
  helpText?: ReactNode;
  className?: string;
}

export function PageToolbar({
  search,
  filters,
  trailing,
  primaryAction,
  helpText,
  className,
}: PageToolbarProps) {
  const hasRight = trailing || primaryAction || helpText;
  return (
    <div className={cn("flex flex-wrap items-center gap-2 sm:gap-3 min-w-0", className)}>
      {search && (
        <div className="min-w-0 flex-1 sm:flex-none sm:w-64 md:w-72">{search}</div>
      )}
      {filters && (
        <div className="flex flex-wrap items-center gap-2 min-w-0">{filters}</div>
      )}
      {hasRight && (
        <div className="flex items-center gap-2 ml-auto shrink-0">
          {trailing}
          {primaryAction}
          {helpText && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="Ayuda"
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ds-text-3 transition-colors hover:bg-ds-surface-2 hover:text-ds-text-1"
                  >
                    <HelpCircle className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-[12px] leading-relaxed">
                  {helpText}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      )}
    </div>
  );
}
