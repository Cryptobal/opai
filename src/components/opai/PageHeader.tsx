import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}

/**
 * PageHeader - Encabezado estándar para todas las páginas de la app
 * 
 * Proporciona una estructura consistente para títulos, descripciones y acciones.
 * Se usa en todas las páginas del dashboard.
 * 
 * @example
 * ```tsx
 * <PageHeader
 *   title="Documentos"
 *   description="Gestiona tus presentaciones comerciales"
 *   actions={<Button>Crear Documento</Button>}
 * />
 * ```
 */
export function PageHeader({ 
  title, 
  description, 
  actions,
  className 
}: PageHeaderProps) {
  return (
    <div className={cn(
      "flex items-center justify-between border-b border-border py-3 mb-4",
      className
    )}>
      <div className="flex-1 min-w-0">
        <h1 className="text-xl font-bold tracking-tight leading-tight">{title}</h1>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 ml-4 flex-shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
}
