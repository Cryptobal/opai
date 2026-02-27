import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Inbox } from 'lucide-react';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
  /** Ultra-compact inline mode: single line with muted text, no icon, no padding */
  inline?: boolean;
}

/**
 * EmptyState - Estado vacío estándar
 *
 * inline=true: single-line muted text for collapsible sections (no icon, no border)
 * compact=true: para inline dentro de cards (menos alto)
 * compact=false: para páginas completas
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  compact = false,
  inline = false,
}: EmptyStateProps) {
  if (inline) {
    return (
      <div className={cn("flex items-center gap-2 py-2 text-sm text-muted-foreground", className)}>
        <span>{title}</span>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact
          ? "py-8 px-4"
          : "min-h-[280px] rounded-lg border border-dashed border-border bg-muted/10 px-6 py-12",
        className
      )}
    >
      <div className="mb-3 text-muted-foreground/40">
        {icon || <Inbox className="h-10 w-10" />}
      </div>
      <h3 className="mb-1 text-base font-medium text-foreground">{title}</h3>
      {description && (
        <p className="mb-4 max-w-md text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div>{action}</div>}
    </div>
  );
}
