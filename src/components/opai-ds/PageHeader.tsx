import { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  /** Link "Volver a X" cuando se proporciona */
  backHref?: string;
  backLabel?: string;
}

/**
 * PageHeader - Encabezado estándar para todas las páginas
 *
 * OPAI Type Scale:
 * - H1 (page):   text-xl sm:text-2xl font-semibold — este componente
 * - H2 (card):   text-lg font-semibold — CardTitle
 * - H3 (section): text-base font-semibold — secciones internas
 * - Body:        text-sm sm:text-base — texto principal
 * - Caption:     text-sm — labels, metadata
 * - Micro:       text-xs — badges, bottom nav
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
  backHref,
  backLabel,
}: PageHeaderProps) {
  return (
    <div className={cn(
      "flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between mb-4",
      className
    )}>
      <div className="min-w-0">
        {backHref && backLabel && (
          <Link
            href={backHref}
            className="inline-flex items-center gap-1 text-sm sm:text-base text-muted-foreground hover:text-foreground mb-1.5"
          >
            <ChevronLeft className="h-4 w-4" />
            Volver a {backLabel}
          </Link>
        )}
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">{title}</h1>
        {description != null && (
          <div className="text-sm sm:text-base text-muted-foreground mt-0.5">{description}</div>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 pt-2 sm:pt-0 min-w-0">
          {actions}
        </div>
      )}
    </div>
  );
}
