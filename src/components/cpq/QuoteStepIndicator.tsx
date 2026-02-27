"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface QuoteStepIndicatorProps {
  steps: string[];
  currentStep: number;
  onStepClick?: (step: number) => void;
}

/**
 * QuoteStepIndicator — Pills horizontales con labels visibles en mobile.
 *
 * Reemplaza el Stepper genérico de dots por pills clickeables con el
 * nombre del paso siempre visible. Diseño mobile-first.
 *
 * - Paso activo: fondo verde sutil, texto verde, barra inferior verde.
 * - Pasos completados: barra verde atenuada, check icon.
 * - Pasos pendientes: fondo transparente, texto gris, barra gris.
 */
export function QuoteStepIndicator({
  steps,
  currentStep,
  onStepClick,
}: QuoteStepIndicatorProps) {
  return (
    <div className="flex gap-1">
      {steps.map((label, index) => {
        const isCompleted = index < currentStep;
        const isCurrent = index === currentStep;
        const isPending = index > currentStep;

        return (
          <button
            key={index}
            type="button"
            onClick={() => onStepClick?.(index)}
            disabled={!onStepClick}
            className={cn(
              "flex-1 flex flex-col items-center rounded-md px-1 py-1.5 transition-all duration-200 min-w-0",
              onStepClick && "cursor-pointer",
              !onStepClick && "cursor-default",
              isCurrent && "bg-emerald-500/[0.12]",
              isCompleted && "bg-emerald-500/[0.04]",
              isPending && "bg-transparent"
            )}
            title={label}
          >
            {/* Label + optional check */}
            <div className="flex items-center gap-0.5 min-w-0 w-full justify-center">
              {isCompleted && (
                <Check className="h-2.5 w-2.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              )}
              <span
                className={cn(
                  "text-[10px] font-medium truncate leading-tight",
                  "lg:text-[11px]",
                  isCurrent && "text-emerald-700 dark:text-emerald-400 font-semibold",
                  isCompleted && "text-emerald-600/70 dark:text-emerald-400/50",
                  isPending && "text-muted-foreground/50"
                )}
              >
                {label}
              </span>
            </div>

            {/* Progress bar */}
            <div
              className={cn(
                "mt-1 h-[2px] w-full rounded-full transition-colors duration-200",
                isCurrent && "bg-emerald-500",
                isCompleted && "bg-emerald-500/40",
                isPending && "bg-border"
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
