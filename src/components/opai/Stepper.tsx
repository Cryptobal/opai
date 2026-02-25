import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StepperProps {
  steps: string[];
  currentStep: number;
  onStepClick?: (step: number) => void;
  className?: string;
}

/**
 * Stepper - Indicador de progreso ultra-compacto
 *
 * Barra segmentada con dots + nombre del paso actual.
 * Diseñado para ocupar máximo 40px de alto.
 */
export function Stepper({ steps, currentStep, onStepClick, className }: StepperProps) {
  return (
    <div className={cn('w-full', className)}>
      {/* Segmented progress bar with integrated dots */}
      <div className="flex items-center gap-1">
        {steps.map((label, index) => {
          const isCompleted = index < currentStep;
          const isCurrent = index === currentStep;

          return (
            <button
              key={index}
              type="button"
              onClick={() => onStepClick?.(index)}
              disabled={!onStepClick}
              className={cn(
                "group relative flex-1 flex flex-col items-center gap-1",
                onStepClick && "cursor-pointer",
                !onStepClick && "cursor-default"
              )}
              title={label}
            >
              {/* Segment bar */}
              <div
                className={cn(
                  "h-1.5 w-full rounded-full transition-all duration-300",
                  isCompleted && "bg-primary",
                  isCurrent && "bg-primary",
                  !isCompleted && !isCurrent && "bg-border"
                )}
              />
              {/* Dot + label */}
              <div className="flex items-center gap-1 min-w-0">
                <div
                  className={cn(
                    "shrink-0 rounded-full transition-all duration-200",
                    isCompleted && "h-2 w-2 bg-primary",
                    isCurrent && "h-2.5 w-2.5 bg-primary ring-2 ring-primary/20",
                    !isCompleted && !isCurrent && "h-2 w-2 bg-muted-foreground/30"
                  )}
                >
                  {isCompleted && (
                    <Check className="h-2 w-2 text-primary-foreground" />
                  )}
                </div>
                <span
                  className={cn(
                    "text-[10px] font-medium truncate hidden sm:inline",
                    isCurrent && "text-foreground",
                    isCompleted && "text-muted-foreground",
                    !isCompleted && !isCurrent && "text-muted-foreground/50"
                  )}
                >
                  {label}
                </span>
              </div>
            </button>
          );
        })}
      </div>
      {/* Mobile: show current step name */}
      <div className="sm:hidden mt-1 text-center">
        <span className="text-[11px] font-medium text-foreground">
          {currentStep + 1}. {steps[currentStep]}
        </span>
      </div>
    </div>
  );
}
