'use client';

/**
 * KpiCard - Componente premium para mostrar métricas clave
 * Con contadores animados y glassmorphism effects
 */

import { KpiMetric } from '@/types/presentation';
import { useThemeClasses } from '../ThemeProvider';
import { cn } from '@/lib/utils';
import CountUp from 'react-countup';
import { useInView } from 'react-intersection-observer';

interface KpiCardProps {
  metric: KpiMetric;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function KpiCard({ metric, className, size = 'md' }: KpiCardProps) {
  const theme = useThemeClasses();
  const [ref, inView] = useInView({
    triggerOnce: true,
    threshold: 0.5,
  });
  
  const sizeClasses = {
    sm: 'p-5',
    md: 'p-6',
    lg: 'p-8',
  };
  
  const valueSizeClasses = {
    sm: 'text-3xl',
    md: 'text-5xl',
    lg: 'text-6xl',
  };
  
  // Extraer número del value si es string con número
  const getNumericValue = (value: string | number): number | null => {
    if (typeof value === 'number') return value;
    const match = value.match(/(\d+(?:\.\d+)?)/);
    return match ? parseFloat(match[1]) : null;
  };
  
  const numericValue = getNumericValue(metric.value);
  const hasPercentage = typeof metric.value === 'string' && metric.value.includes('%');
  const hasSuffix = typeof metric.value === 'string' && metric.value.includes('+');
  
  return (
    <div
      ref={ref}
      className={cn(
        'glass-card-hover group relative overflow-hidden',
        sizeClasses[size],
        className
      )}
    >
      {/* Glow effect on hover */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
        <div className={cn(
          'absolute inset-0 blur-xl',
          theme.accent.replace('bg-', 'bg-'),
          'opacity-20'
        )} />
      </div>
      
      <div className="relative z-10 flex flex-col gap-2">
        {/* Valor principal con contador animado */}
        <div className={cn(
          'font-black tracking-tight',
          'bg-gradient-to-br from-teal-400 via-teal-300 to-blue-400',
          'bg-clip-text text-transparent',
          valueSizeClasses[size]
        )}>
          {numericValue !== null && inView ? (
            <>
              <CountUp
                start={0}
                end={numericValue}
                duration={2.5}
                decimals={metric.value.toString().includes('.') ? 1 : 0}
                separator=","
              />
              {hasPercentage && '%'}
              {hasSuffix && '+'}
            </>
          ) : (
            metric.value
          )}
        </div>
        
        {/* Label */}
        <div className={cn('text-sm font-semibold tracking-wide', theme.text)}>
          {metric.label}
        </div>
        
        {/* Delta (opcional) */}
        {metric.delta && (
          <div className="flex items-center gap-1 text-xs font-bold text-green-400">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>
            {metric.delta}
          </div>
        )}
        
        {/* Nota (opcional) */}
        {metric.note && (
          <div className={cn('text-xs mt-2 opacity-70', theme.textMuted)}>
            {metric.note}
          </div>
        )}
      </div>
      
      {/* Border glow effect */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        <div className="absolute inset-0 rounded-lg border-2 border-teal-400/50 blur-sm" />
      </div>
    </div>
  );
}

/**
 * Grid de KPI Cards
 */
interface KpiGridProps {
  metrics: KpiMetric[];
  columns?: 2 | 3 | 4;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function KpiGrid({ 
  metrics, 
  columns = 4, 
  size = 'md',
  className 
}: KpiGridProps) {
  const gridClasses = {
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4',
  };
  
  return (
    <div className={cn(
      'grid gap-6',
      gridClasses[columns],
      className
    )}>
      {metrics.map((metric, index) => (
        <KpiCard key={index} metric={metric} size={size} />
      ))}
    </div>
  );
}
