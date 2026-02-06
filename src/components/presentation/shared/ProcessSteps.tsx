'use client';

/**
 * ProcessSteps - Componente para mostrar pasos de proceso
 * Usado en sección S09 (Cómo Operamos)
 */

import { ProcessStep } from '@/types/presentation';
import { useThemeClasses } from '../ThemeProvider';
import { cn } from '@/lib/utils';

interface ProcessStepsProps {
  steps: ProcessStep[];
  className?: string;
}

export function ProcessSteps({ steps, className }: ProcessStepsProps) {
  const theme = useThemeClasses();
  
  return (
    <div className={cn('space-y-6', className)}>
      {steps.map((step, index) => (
        <div
          key={index}
          className={cn(
            'relative p-6 rounded-lg border',
            theme.border,
            theme.secondary,
            'transition-all hover:scale-[1.02]'
          )}
        >
          {/* Número del paso */}
          <div className="flex items-start gap-4">
            <div className={cn(
              'w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0',
              theme.accent
            )}>
              <span className="text-xl font-bold text-white">{step.step}</span>
            </div>
            
            <div className="flex-1">
              {/* Título */}
              <h3 className={cn('text-xl font-bold mb-2', theme.text)}>
                {step.title}
              </h3>
              
              {/* Descripción */}
              <p className={cn('mb-3', theme.textMuted)}>
                {step.description}
              </p>
              
              {/* Entregable (opcional) */}
              {step.deliverable && (
                <div className={cn(
                  'mt-4 p-3 rounded border-l-4',
                  theme.border,
                  'bg-opacity-50'
                )}>
                  <div className={cn('text-sm font-semibold mb-1', theme.text)}>
                    Entregable:
                  </div>
                  <div className={cn('text-sm', theme.textMuted)}>
                    {step.deliverable}
                  </div>
                </div>
              )}
            </div>
          </div>
          
          {/* Conector al siguiente paso (excepto el último) */}
          {index < steps.length - 1 && (
            <div className={cn(
              'absolute left-[2.5rem] -bottom-3 w-0.5 h-6',
              theme.border
            )} />
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Versión compacta en grid (para pasos simples)
 */
export function ProcessStepsGrid({ steps, className }: ProcessStepsProps) {
  const theme = useThemeClasses();
  
  return (
    <div className={cn(
      'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6',
      className
    )}>
      {steps.map((step, index) => (
        <div
          key={index}
          className={cn(
            'p-6 rounded-lg border text-center',
            theme.border,
            theme.secondary
          )}
        >
          <div className={cn(
            'w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4',
            theme.accent
          )}>
            <span className="text-2xl font-bold text-white">{step.step}</span>
          </div>
          
          <h4 className={cn('text-lg font-bold mb-2', theme.text)}>
            {step.title}
          </h4>
          
          <p className={cn('text-sm', theme.textMuted)}>
            {step.description}
          </p>
        </div>
      ))}
    </div>
  );
}
