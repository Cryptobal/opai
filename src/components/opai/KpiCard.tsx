import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export type TrendType = 'up' | 'down' | 'neutral';

export interface KpiCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon?: ReactNode;
  trend?: TrendType;
  trendValue?: string;
  className?: string;
}

/**
 * KpiCard - Card estándar para mostrar métricas y KPIs
 * 
 * Características:
 * - Icono opcional (top-right)
 * - Valor destacado grande
 * - Descripción/subtitle opcional
 * - Indicador de tendencia con color semántico
 * 
 * @example
 * ```tsx
 * <KpiCard
 *   title="Total Presentaciones"
 *   value="127"
 *   description="Este mes"
 *   icon={<FileText />}
 *   trend="up"
 *   trendValue="+12%"
 * />
 * ```
 */
export function KpiCard({ 
  title, 
  value, 
  description, 
  icon, 
  trend,
  trendValue,
  className 
}: KpiCardProps) {
  const trendIcons = {
    up: ArrowUp,
    down: ArrowDown,
    neutral: Minus,
  };

  const trendColors = {
    up: 'text-green-500',
    down: 'text-red-500',
    neutral: 'text-muted-foreground',
  };

  const TrendIcon = trend ? trendIcons[trend] : null;

  return (
    <Card className={cn("relative overflow-hidden", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        {icon && (
          <div className="text-muted-foreground opacity-70">
            {icon}
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          <div className="text-3xl font-bold tracking-tight">
            {value}
          </div>
          {(description || (trend && trendValue)) && (
            <div className="flex items-center gap-2 text-sm">
              {trend && TrendIcon && trendValue && (
                <div className={cn("flex items-center gap-1", trendColors[trend])}>
                  <TrendIcon className="h-4 w-4" />
                  <span className="font-medium">{trendValue}</span>
                </div>
              )}
              {description && (
                <span className="text-muted-foreground">
                  {description}
                </span>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
