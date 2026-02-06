import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

export type LoadingStateType = 'spinner' | 'skeleton' | 'overlay';

export interface LoadingStateProps {
  type?: LoadingStateType;
  text?: string;
  rows?: number;
  className?: string;
}

/**
 * LoadingState - Estados de carga consistentes
 * 
 * Tres variantes:
 * - spinner: Loader centrado con texto opcional
 * - skeleton: Cards skeleton para listados (rows controla cantidad)
 * - overlay: Overlay con blur para acciones en progreso
 * 
 * @example
 * ```tsx
 * // Spinner simple
 * <LoadingState type="spinner" text="Cargando..." />
 * 
 * // Skeleton para tabla
 * <LoadingState type="skeleton" rows={5} />
 * 
 * // Overlay para acciones
 * <LoadingState type="overlay" text="Guardando..." />
 * ```
 */
export function LoadingState({ 
  type = 'spinner', 
  text,
  rows = 3,
  className 
}: LoadingStateProps) {
  // Spinner centrado
  if (type === 'spinner') {
    return (
      <div 
        className={cn(
          "flex min-h-[400px] flex-col items-center justify-center gap-4",
          className
        )}
      >
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        {text && (
          <p className="text-sm text-muted-foreground">{text}</p>
        )}
      </div>
    );
  }

  // Skeleton cards
  if (type === 'skeleton') {
    return (
      <div className={cn("space-y-4", className)}>
        {Array.from({ length: rows }).map((_, i) => (
          <div 
            key={i}
            className="h-24 rounded-lg border border-border bg-muted/20 animate-pulse"
          />
        ))}
      </div>
    );
  }

  // Overlay con blur
  if (type === 'overlay') {
    return (
      <div 
        className={cn(
          "fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm",
          className
        )}
      >
        <div className="flex flex-col items-center gap-4 rounded-lg bg-card p-8 shadow-lg">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          {text && (
            <p className="text-sm font-medium">{text}</p>
          )}
        </div>
      </div>
    );
  }

  return null;
}
