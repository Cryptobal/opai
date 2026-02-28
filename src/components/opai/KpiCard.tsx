import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { ArrowUp, ArrowDown, Minus, Info } from 'lucide-react';

export type TrendType = 'up' | 'down' | 'neutral';
export type KpiVariant = 'default' | 'blue' | 'emerald' | 'purple' | 'amber' | 'red' | 'indigo' | 'sky' | 'teal';

export interface KpiCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon?: ReactNode;
  trend?: TrendType;
  trendValue?: string;
  className?: string;
  variant?: KpiVariant;
  size?: 'sm' | 'md' | 'lg';
  tooltip?: ReactNode;
  /** Tooltip que se muestra al hacer hover sobre el botón "i" junto al título (ej. explicación del cálculo) */
  titleInfoTooltip?: ReactNode;
  /** Clases adicionales para la descripción (ej. para agrandar o colorear) */
  descriptionClassName?: string;
}

/**
 * KpiCard - Card estandarizada para métricas
 *
 * Tipografía:
 * - Label: text-xs uppercase text-muted-foreground
 * - Value: text-lg font-semibold font-mono
 * - Trend: text-xs
 */
export function KpiCard({
  title,
  value,
  description,
  icon,
  trend,
  trendValue,
  className,
  variant = 'default',
  size = 'md',
  tooltip,
  titleInfoTooltip,
  descriptionClassName,
}: KpiCardProps) {
  const trendIcons = { up: ArrowUp, down: ArrowDown, neutral: Minus };
  const trendColors = {
    up: 'text-emerald-400',
    down: 'text-red-400',
    neutral: 'text-muted-foreground',
  };

  const variantBg: Record<KpiVariant, string> = {
    default: 'border-border bg-card',
    blue: 'border-blue-500/25 bg-blue-500/10',
    emerald: 'border-emerald-500/25 bg-emerald-500/10',
    purple: 'border-purple-500/25 bg-purple-500/10',
    amber: 'border-amber-500/25 bg-amber-500/10',
    red: 'border-red-500/25 bg-red-500/10',
    indigo: 'border-indigo-500/25 bg-indigo-500/10',
    sky: 'border-sky-500/25 bg-sky-500/10',
    teal: 'border-primary/25 bg-primary/10',
  };

  const variantIconBg: Record<KpiVariant, string> = {
    default: 'p-1.5 rounded-lg bg-muted text-muted-foreground',
    blue: 'p-1.5 rounded-lg bg-blue-500/15 text-blue-400',
    emerald: 'p-1.5 rounded-lg bg-emerald-500/15 text-emerald-400',
    purple: 'p-1.5 rounded-lg bg-purple-500/15 text-purple-400',
    amber: 'p-1.5 rounded-lg bg-amber-500/15 text-amber-400',
    red: 'p-1.5 rounded-lg bg-red-500/15 text-red-400',
    indigo: 'p-1.5 rounded-lg bg-indigo-500/15 text-indigo-400',
    sky: 'p-1.5 rounded-lg bg-sky-500/15 text-sky-400',
    teal: 'p-1.5 rounded-lg bg-primary/15 text-primary',
  };

  const variantText: Record<KpiVariant, string> = {
    default: 'text-foreground',
    blue: 'text-blue-400',
    emerald: 'text-emerald-400',
    purple: 'text-purple-400',
    amber: 'text-amber-400',
    red: 'text-red-400',
    indigo: 'text-indigo-400',
    sky: 'text-sky-400',
    teal: 'text-primary',
  };

  const padding = size === 'sm' ? 'p-3' : size === 'lg' ? 'p-4' : 'p-3';
  const valueSize = size === 'sm' ? 'text-base' : size === 'lg' ? 'text-xl' : 'text-lg';

  const TrendIcon = trend ? trendIcons[trend] : null;

  const cardContent = (
    <div className={cn(
      "rounded-lg border min-w-0",
      variantBg[variant],
      padding,
      className
    )}>
      <div className="flex items-center justify-between gap-1 mb-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1.5 min-w-0">
          {title}
          {titleInfoTooltip != null && (
            <span className="group/info relative shrink-0 inline-flex" tabIndex={0} role="button" aria-label="Más información">
              <Info className="h-3.5 w-3.5 text-muted-foreground/70 hover:text-muted-foreground cursor-help" aria-hidden />
              <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 hidden w-64 max-w-[calc(100vw-2rem)] rounded-md border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg group-hover/info:block group-focus-within/info:block z-50">
                {titleInfoTooltip}
              </span>
            </span>
          )}
        </span>
        {icon && (
          <span className={variantIconBg[variant]}>{icon}</span>
        )}
      </div>
      <div className={cn(valueSize, "font-semibold font-mono tracking-tight break-words", variantText[variant])}>
        {value}
      </div>
      {(description || (trend && trendValue)) && (
        <div className="mt-1 flex min-w-0 items-center gap-2 text-xs">
          {trend && TrendIcon && trendValue && (
            <span className={cn("flex min-w-0 items-center gap-0.5", trendColors[trend])}>
              <TrendIcon className="h-3 w-3" />
              <span className="truncate">{trendValue}</span>
            </span>
          )}
          {description && (
            <span className={cn("min-w-0 truncate text-muted-foreground", descriptionClassName)}>{description}</span>
          )}
        </div>
      )}
    </div>
  );

  if (tooltip) {
    return (
      <div className="group relative" tabIndex={0}>
        {cardContent}
        <div className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 hidden w-max max-w-xs -translate-x-1/2 rounded-md border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg group-hover:block group-focus-within:block">
          {tooltip}
        </div>
      </div>
    );
  }

  return cardContent;
}
