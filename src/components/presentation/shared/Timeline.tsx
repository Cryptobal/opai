'use client';

/**
 * Timeline - Componente para mostrar líneas de tiempo
 * Usado en múltiples secciones para procesos secuenciales
 */

import { TimelineStep } from '@/types/presentation';
import { useThemeClasses } from '../ThemeProvider';
import { cn } from '@/lib/utils';

interface TimelineProps {
  steps: TimelineStep[];
  className?: string;
  orientation?: 'vertical' | 'horizontal';
}

export function Timeline({ 
  steps, 
  className,
  orientation = 'vertical' 
}: TimelineProps) {
  const theme = useThemeClasses();
  
  if (orientation === 'horizontal') {
    return (
      <div className={cn('hidden lg:block', className)}>
        <div className="flex items-start justify-between relative">
          {/* Línea conectora */}
          <div className={cn(
            'absolute top-6 left-0 right-0 h-0.5',
            theme.border
          )} />
          
          {steps.map((step, index) => (
            <div key={index} className="relative flex-1 flex flex-col items-center">
              {/* Punto */}
              <div className={cn(
                'w-12 h-12 rounded-full flex items-center justify-center relative z-10',
                theme.accent,
                theme.text
              )}>
                <span className="font-bold">{index + 1}</span>
              </div>
              
              {/* Contenido */}
              <div className="mt-4 text-center px-2">
                <div className={cn('text-sm font-semibold mb-1', theme.accent.replace('bg-', 'text-'))}>
                  {step.week}
                </div>
                <div className={cn('font-bold mb-2', theme.text)}>
                  {step.title}
                </div>
                <div className={cn('text-sm', theme.textMuted)}>
                  {step.description}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  
  // Vertical timeline (mobile-first)
  return (
    <div className={cn('relative', className)}>
      {/* Línea vertical */}
      <div className={cn(
        'absolute left-6 top-0 bottom-0 w-0.5',
        theme.border
      )} />
      
      <div className="space-y-8">
        {steps.map((step, index) => (
          <div key={index} className="relative flex gap-6">
            {/* Punto */}
            <div className={cn(
              'w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 relative z-10',
              theme.accent
            )}>
              <span className="font-bold text-white">{index + 1}</span>
            </div>
            
            {/* Contenido */}
            <div className="flex-1 pt-2">
              <div className={cn('text-sm font-semibold mb-1', theme.accent.replace('bg-', 'text-'))}>
                {step.week}
              </div>
              <div className={cn('text-xl font-bold mb-2', theme.text)}>
                {step.title}
              </div>
              <div className={cn('text-base', theme.textMuted)}>
                {step.description}
              </div>
              {step.duration && (
                <div className={cn('text-sm mt-2 font-medium', theme.text)}>
                  Duración: {step.duration}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
