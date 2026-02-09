import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StepperProps {
  steps: string[];
  currentStep: number;
  onStepClick?: (step: number) => void;
  className?: string;
}

/**
 * Stepper - Indicador de progreso por pasos
 * 
 * Muestra una línea de progreso con círculos para cada paso.
 */
export function Stepper({ steps, currentStep, onStepClick, className }: StepperProps) {
  return (
    <div className={cn('w-full', className)}>
      <div className="flex items-center justify-between">
        {steps.map((label, index) => {
          const isCompleted = index < currentStep;
          const isCurrent = index === currentStep;
          const isLast = index === steps.length - 1;

          return (
            <div key={index} className="flex flex-1 items-center">
              {/* Circle + Label */}
              <button
                type="button"
                onClick={() => onStepClick?.(index)}
                disabled={!onStepClick}
                className={cn(
                  "flex flex-col items-center gap-1.5 transition-colors",
                  onStepClick && "cursor-pointer hover:opacity-80",
                  !onStepClick && "cursor-default"
                )}
              >
                <div
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-semibold transition-all',
                    isCompleted && 'border-primary bg-primary text-primary-foreground',
                    isCurrent && 'border-primary bg-accent text-primary',
                    !isCompleted && !isCurrent && 'border-border bg-background text-muted-foreground'
                  )}
                >
                  {isCompleted ? <Check className="h-4 w-4" /> : index + 1}
                </div>
                <span
                  className={cn(
                    'text-xs font-medium',
                    isCurrent && 'text-foreground',
                    !isCurrent && 'text-muted-foreground'
                  )}
                >
                  {label}
                </span>
              </button>

              {/* Progress Line */}
              {!isLast && (
                <div className="mx-2 h-[2px] flex-1 bg-border relative">
                  <div
                    className={cn(
                      'absolute inset-0 bg-primary transition-all duration-300',
                      isCompleted ? 'w-full' : 'w-0'
                    )}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
