import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface KpiGridProps {
  /** KpiCards como children */
  children: ReactNode;
  /** Número de columnas en breakpoints mayores */
  columns?: 2 | 3 | 4;
  className?: string;
}

/**
 * KpiGrid - Grid responsive para KpiCards
 *
 * Estandariza el layout de métricas que antes usaba clases diferentes
 * en cada dashboard.
 *
 * @example
 * ```tsx
 * <KpiGrid columns={4}>
 *   <KpiCard title="Ventas" value="$12,500" trend="up" trendValue="+8%" />
 *   <KpiCard title="Pedidos" value="142" trend="down" trendValue="-3%" />
 *   <KpiCard title="Clientes" value="89" />
 *   <KpiCard title="Margen" value="34%" variant="emerald" />
 * </KpiGrid>
 * ```
 */
export function KpiGrid({
  children,
  columns = 4,
  className,
}: KpiGridProps) {
  const responsiveClasses: Record<number, string> = {
    2: 'grid grid-cols-2 gap-3',
    3: 'grid grid-cols-2 gap-3 md:grid-cols-3',
    4: 'grid grid-cols-2 gap-3 md:grid-cols-2 lg:grid-cols-4',
  };

  return (
    <div className={cn(responsiveClasses[columns], className)}>
      {children}
    </div>
  );
}
