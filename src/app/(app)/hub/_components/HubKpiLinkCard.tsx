import Link from 'next/link';
import { cn } from '@/lib/utils';
import { KpiCard } from '@/components/opai/KpiCard';
import type { KpiLinkCardProps } from '../_lib/hub-types';

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
  return (
    <Link href={href} className="block min-w-0">
      <KpiCard
        title={title}
        value={value}
        description={description}
        icon={icon}
        trend={trend}
        trendValue={trendValue}
        variant={variant}
        titleInfoTooltip={titleInfoTooltip}
        className={cn(
          "h-full cursor-pointer transition-all duration-200 hover:ring-2 hover:ring-primary/25 hover:shadow-md hover:-translate-y-0.5",
          alert && "border-red-500/30 bg-red-500/5"
        )}
      />
    </Link>
  );
}
