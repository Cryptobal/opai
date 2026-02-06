'use client';

/**
 * AnimatedStat - Contador animado para estadísticas
 * Efecto contador con glow y animación
 */

import { useInView } from 'react-intersection-observer';
import { cn } from '@/lib/utils';
import CountUp from 'react-countup';

interface AnimatedStatProps {
  value: number;
  label: string;
  suffix?: string;
  prefix?: string;
  decimals?: number;
  className?: string;
}

export function AnimatedStat({ 
  value, 
  label, 
  suffix = '', 
  prefix = '',
  decimals = 0,
  className 
}: AnimatedStatProps) {
  const [ref, inView] = useInView({
    triggerOnce: true,
    threshold: 0.5,
  });
  
  return (
    <div ref={ref} className={cn('text-center group', className)}>
      <div className={cn(
        'text-5xl md:text-7xl font-black mb-3',
        'bg-gradient-to-br from-teal-400 via-teal-300 to-blue-400',
        'bg-clip-text text-transparent',
        'group-hover:scale-110 transition-transform duration-300'
      )}>
        {prefix}
        {inView && (
          <CountUp
            start={0}
            end={value}
            duration={2.5}
            decimals={decimals}
            separator=","
          />
        )}
        {suffix}
      </div>
      <div className="text-base md:text-lg font-semibold text-white/80">
        {label}
      </div>
    </div>
  );
}

/**
 * Grid de stats animados
 */
interface AnimatedStatsGridProps {
  stats: AnimatedStatProps[];
  columns?: 2 | 3 | 4;
  className?: string;
}

export function AnimatedStatsGrid({ stats, columns = 4, className }: AnimatedStatsGridProps) {
  const gridClasses = {
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-2 lg:grid-cols-4',
  };
  
  return (
    <div className={cn(
      'grid gap-8',
      gridClasses[columns],
      className
    )}>
      {stats.map((stat, index) => (
        <AnimatedStat key={index} {...stat} />
      ))}
    </div>
  );
}
