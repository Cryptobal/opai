import Link from 'next/link';
import { ArrowDownRight, ArrowUpRight, Info, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Surface } from '@/components/opai-ds';
import type { KpiLinkCardProps, KpiVariant, TrendType } from '../_lib/hub-types';

const VARIANT_VALUE_COLOR: Record<KpiVariant, string> = {
  default: 'text-ds-text-1',
  blue: 'text-primary',
  emerald: 'text-status-ok-fg',
  purple: 'text-primary',
  amber: 'text-status-warn-fg',
  red: 'text-status-danger-fg',
  indigo: 'text-primary',
  sky: 'text-primary',
  teal: 'text-primary',
};

const VARIANT_ACCENT: Record<KpiVariant, string> = {
  default: '',
  blue: 'before:bg-primary',
  emerald: 'before:bg-status-ok',
  purple: 'before:bg-primary',
  amber: 'before:bg-status-warn',
  red: 'before:bg-status-danger',
  indigo: 'before:bg-primary',
  sky: 'before:bg-primary',
  teal: 'before:bg-primary',
};

const TREND_ICON: Record<TrendType, typeof ArrowUpRight> = {
  up: ArrowUpRight,
  down: ArrowDownRight,
  neutral: Minus,
};

const TREND_COLOR: Record<TrendType, string> = {
  up: 'text-status-ok-fg',
  down: 'text-status-danger-fg',
  neutral: 'text-ds-text-3',
};

export function HubKpiLinkCard({
  href,
  title,
  value,
  description,
  icon,
  trend,
  trendValue,
  variant = 'default',
  titleInfoTooltip,
  alert,
}: KpiLinkCardProps) {
  const TrendIcon = trend ? TREND_ICON[trend] : null;

  return (
    <Link href={href} className="block min-w-0">
      <Surface
        elevation={1}
        padding="none"
        hoverable
        tappable
        className={cn(
          'relative overflow-hidden p-3.5 sm:p-4 min-h-[78px] sm:min-h-[92px] h-full transition-all duration-200 hover:ring-2 hover:ring-primary/25 hover:shadow-md hover:-translate-y-0.5',
          variant !== 'default' && [
            'before:absolute before:left-0 before:top-3 before:bottom-3 before:w-[2px] before:rounded-r',
            VARIANT_ACCENT[variant],
          ],
          alert && 'border-status-danger/30 bg-status-danger/5',
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-4 min-w-0">
            <span className="truncate">{title}</span>
            {titleInfoTooltip != null && (
              <span
                className="group/info relative shrink-0 inline-flex"
                tabIndex={0}
                role="button"
                aria-label="Más información"
              >
                <Info className="h-3.5 w-3.5 text-ds-text-4 hover:text-ds-text-2 cursor-help" aria-hidden />
                <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 hidden w-64 max-w-[calc(100vw-2rem)] rounded-md border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg group-hover/info:block group-focus-within/info:block z-50">
                  {titleInfoTooltip}
                </span>
              </span>
            )}
          </span>
          {icon && (
            <span className="text-ds-text-4 shrink-0 [&>*]:h-3.5 [&>*]:w-3.5">
              {icon}
            </span>
          )}
        </div>

        <div className="mt-1.5 flex items-baseline gap-2">
          <span
            className={cn(
              'font-display text-2xl sm:text-[28px] font-bold leading-none ds-num',
              VARIANT_VALUE_COLOR[variant],
            )}
          >
            {value}
          </span>
          {TrendIcon && trendValue && (
            <span className={cn('flex items-center gap-0.5 text-xs ds-num', TREND_COLOR[trend!])}>
              <TrendIcon className="h-3 w-3" />
              <span className="truncate">{trendValue}</span>
            </span>
          )}
        </div>

        {description && (
          <p className="mt-1 text-[12px] text-ds-text-3 leading-snug truncate">
            {description}
          </p>
        )}
      </Surface>
    </Link>
  );
}
