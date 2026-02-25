import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StepperProps {
  steps: string[];
  currentStep: number;
  onStepClick?: (step: number) => void;
  className?: string;
}

/**
 * Stepper - Horizontal pill-strip step navigator
 *
 * Mobile-first single-row with horizontal scroll + snap.
 * Each step is a pill showing number + label inline.
 */
export function Stepper({ steps, currentStep, onStepClick, className }: StepperProps) {
  return (
    <div className={cn('w-full', className)}>
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1 -mx-4 px-4 snap-x">
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
                'flex items-center gap-1.5 rounded-full border px-3 py-2 text-sm font-medium whitespace-nowrap snap-start shrink-0 transition-all duration-200 min-h-[44px]',
                onStepClick && 'cursor-pointer',
                !onStepClick && 'cursor-default',
                isCurrent && 'bg-primary text-primary-foreground border-primary shadow-sm',
                isCompleted && 'bg-primary/10 text-primary border-primary/30',
                !isCurrent && !isCompleted && 'bg-muted/30 text-muted-foreground border-border/50'
              )}
            >
              {isCompleted ? (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20">
                  <Check className="h-3 w-3" />
                </span>
              ) : (
                <span className={cn(
                  'flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold',
                  isCurrent && 'bg-primary-foreground/20',
                  !isCurrent && 'bg-muted-foreground/20'
                )}>
                  {index + 1}
                </span>
              )}
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
