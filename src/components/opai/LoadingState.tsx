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
 * LoadingState - Estados de carga estandarizados
 *
 * - spinner: centrado con texto opcional
 * - skeleton: pulse cards para listas
 * - overlay: full-screen para acciones
 */
export function LoadingState({
  type = 'spinner',
  text,
  rows = 3,
  className,
}: LoadingStateProps) {
  if (type === 'spinner') {
    return (
      <div className={cn('flex min-h-[200px] flex-col items-center justify-center gap-3', className)}>
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        {text && <p className="text-sm text-muted-foreground">{text}</p>}
      </div>
    );
  }

  if (type === 'skeleton') {
    return (
      <div className={cn('space-y-3', className)}>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-lg border border-border p-4">
            <div className="h-9 w-9 rounded-lg bg-muted animate-pulse" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-1/3 rounded bg-muted animate-pulse" />
              <div className="h-2.5 w-2/3 rounded bg-muted/60 animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (type === 'overlay') {
    return (
      <div className={cn('fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm', className)}>
        <div className="flex flex-col items-center gap-3 rounded-lg bg-card border border-border p-6 shadow-xl">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          {text && <p className="text-sm font-medium">{text}</p>}
        </div>
      </div>
    );
  }

  return null;
}
