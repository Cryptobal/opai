"use client";

/**
 * OPAI DS v3 — LoadingState
 *
 * Drop-in replacement de `@/components/opai/LoadingState` (legacy).
 * Misma API. Internamente usa Spinner y Skeleton del DS v3 para
 * consistencia visual.
 *
 * Variants:
 *  - spinner (default): centrado con texto opcional
 *  - skeleton: pulse cards para listas (N rows configurables)
 *  - overlay: full-screen para acciones bloqueantes (sin uso actual,
 *    mantenido para compatibilidad de API)
 */

import { cn } from "@/lib/utils";
import { Spinner } from "./Spinner";
import { Skeleton } from "./Skeleton";

export type LoadingStateType = "spinner" | "skeleton" | "overlay";

export interface LoadingStateProps {
  /** Tipo visual. Default: 'spinner'. */
  type?: LoadingStateType;
  /** Texto debajo del spinner (solo aplica a 'spinner' y 'overlay'). */
  text?: string;
  /** Número de skeleton rows (solo aplica a 'skeleton'). Default: 3. */
  rows?: number;
  className?: string;
}

export function LoadingState({
  type = "spinner",
  text,
  rows = 3,
  className,
}: LoadingStateProps) {
  if (type === "spinner") {
    return (
      <div
        className={cn(
          "flex min-h-[200px] flex-col items-center justify-center gap-3",
          className,
        )}
      >
        <Spinner size="md" />
        {text && <p className="text-sm text-ds-text-3">{text}</p>}
      </div>
    );
  }

  if (type === "skeleton") {
    return (
      <div className={cn("space-y-3", className)}>
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-ds-md border border-ds-border-default p-4"
          >
            <Skeleton shape="circle" className="h-9 w-9" />
            <div className="flex-1 space-y-2">
              <Skeleton shape="text" className="w-1/3" />
              <Skeleton shape="text" className="w-2/3 opacity-60" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (type === "overlay") {
    return (
      <div
        className={cn(
          "fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm",
          className,
        )}
      >
        <div className="flex flex-col items-center gap-3 rounded-ds-md border border-ds-border-default bg-ds-surface-2 p-6 shadow-xl">
          <Spinner size="md" />
          {text && <p className="text-sm font-medium">{text}</p>}
        </div>
      </div>
    );
  }

  return null;
}
