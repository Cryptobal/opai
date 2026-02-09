import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}

/**
 * PageHeader - Encabezado estándar para todas las páginas
 *
 * Tipografía estandarizada:
 * - Título: text-lg font-semibold (18px)
 * - Descripción: text-sm text-muted-foreground (14px)
 */
export function PageHeader({
  title,
  description,
  actions,
  className
}: PageHeaderProps) {
  return (
    <div className={cn(
      "flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between pb-4",
      className
    )}>
      <div className="min-w-0">
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 pt-2 sm:pt-0">
          {actions}
        </div>
      )}
    </div>
  );
}
