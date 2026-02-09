import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { ArrowUp, ArrowDown, Minus } from 'lucide-react';

export type TrendType = 'up' | 'down' | 'neutral';
export type KpiVariant = 'default' | 'blue' | 'emerald' | 'purple' | 'amber' | 'indigo' | 'sky' | 'teal';

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
}: KpiCardProps) {
  const trendIcons = { up: ArrowUp, down: ArrowDown, neutral: Minus };
  const trendColors = {
    up: 'text-emerald-400',
    down: 'text-red-400',
    neutral: 'text-muted-foreground',
  };

  const variantBg: Record<KpiVariant, string> = {
    default: 'border-border bg-card',
    blue: 'border-blue-500/20 bg-blue-500/5',
    emerald: 'border-emerald-500/20 bg-emerald-500/5',
    purple: 'border-purple-500/20 bg-purple-500/5',
    amber: 'border-amber-500/20 bg-amber-500/5',
    indigo: 'border-indigo-500/20 bg-indigo-500/5',
    sky: 'border-sky-500/20 bg-sky-500/5',
    teal: 'border-primary/20 bg-primary/5',
  };

  const variantText: Record<KpiVariant, string> = {
    default: 'text-foreground',
    blue: 'text-blue-400',
    emerald: 'text-emerald-400',
    purple: 'text-purple-400',
    amber: 'text-amber-400',
    indigo: 'text-indigo-400',
    sky: 'text-sky-400',
    teal: 'text-primary',
  };

  const padding = size === 'sm' ? 'p-3' : size === 'lg' ? 'p-4' : 'p-3';
  const valueSize = size === 'sm' ? 'text-base' : size === 'lg' ? 'text-xl' : 'text-lg';

  const TrendIcon = trend ? trendIcons[trend] : null;

  const cardContent = (
    <div className={cn(
      "rounded-lg border",
      variantBg[variant],
      padding,
      className
    )}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </span>
        {icon && (
          <span className="text-muted-foreground/60">{icon}</span>
        )}
      </div>
      <div className={cn(valueSize, "font-semibold font-mono tracking-tight", variantText[variant])}>
        {value}
      </div>
      {(description || (trend && trendValue)) && (
        <div className="mt-1 flex items-center gap-2 text-xs">
          {trend && TrendIcon && trendValue && (
            <span className={cn("flex items-center gap-0.5", trendColors[trend])}>
              <TrendIcon className="h-3 w-3" />
              {trendValue}
            </span>
          )}
          {description && (
            <span className="text-muted-foreground">{description}</span>
          )}
        </div>
      )}
    </div>
  );

  if (tooltip) {
    return (
      <div className="group relative">
        {cardContent}
        <div className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 hidden w-max max-w-xs -translate-x-1/2 rounded-md border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg group-hover:block">
          {tooltip}
        </div>
      </div>
    );
  }

  return cardContent;
}
