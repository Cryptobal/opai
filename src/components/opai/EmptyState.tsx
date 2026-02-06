import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

/**
 * EmptyState - Estado vacío estándar
 * 
 * Muestra un mensaje centrado cuando no hay datos para mostrar.
 * 
 * Características:
 * - Icono opcional (grande, muted)
 * - Título claro
 * - Descripción opcional
 * - CTA/acción opcional
 * 
 * @example
 * ```tsx
 * <EmptyState
 *   icon={<Inbox className="h-16 w-16" />}
 *   title="No hay presentaciones"
 *   description="Crea tu primera presentación para comenzar"
 *   action={<Button>Crear Presentación</Button>}
 * />
 * ```
 */
export function EmptyState({ 
  icon, 
  title, 
  description, 
  action,
  className 
}: EmptyStateProps) {
  return (
    <div 
      className={cn(
        "flex min-h-[400px] flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 px-6 py-12 text-center",
        className
      )}
    >
      {icon && (
        <div className="mb-4 text-muted-foreground/50">
          {icon}
        </div>
      )}
      <h3 className="mb-2 text-xl font-semibold">
        {title}
      </h3>
      {description && (
        <p className="mb-6 max-w-md text-sm text-muted-foreground">
          {description}
        </p>
      )}
      {action && (
        <div>
          {action}
        </div>
      )}
    </div>
  );
}
