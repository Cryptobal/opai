"use client";

import { MapPin, Users, ClipboardCheck, Camera, FileText } from "lucide-react";
import type { WizardStep } from "./types";

const STEPS = [
  { step: 1 as WizardStep, label: "Check-in", icon: MapPin },
  { step: 2 as WizardStep, label: "Evaluación", icon: Users },
  { step: 3 as WizardStep, label: "Verificación", icon: ClipboardCheck },
  { step: 4 as WizardStep, label: "Evidencia", icon: Camera },
  { step: 5 as WizardStep, label: "Cierre", icon: FileText },
];

type Props = {
  currentStep: WizardStep;
  onStepClick?: (step: WizardStep) => void;
  maxReachedStep: WizardStep;
};

export function WizardProgress({ currentStep, onStepClick, maxReachedStep }: Props) {
  return (
    <div className="flex items-center justify-between gap-1 px-2">
      {STEPS.map(({ step, label, icon: Icon }, index) => {
        const isActive = step === currentStep;
        const isCompleted = step < currentStep;
        const isReachable = step <= maxReachedStep;

        return (
          <div key={step} className="flex flex-1 flex-col items-center">
            <button
              type="button"
              disabled={!isReachable || !onStepClick}
              onClick={() => isReachable && onStepClick?.(step)}
              className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all ${
                isActive
                  ? "border-primary bg-primary text-primary-foreground"
                  : isCompleted
                    ? "border-emerald-500 bg-emerald-500/20 text-emerald-400"
                    : isReachable
                      ? "border-muted-foreground/30 bg-muted/50 text-muted-foreground"
                      : "border-border bg-background text-muted-foreground/40"
              }`}
            >
              <Icon className="h-4 w-4" />
            </button>
            <span
              className={`mt-1 text-[10px] font-medium ${
                isActive
                  ? "text-primary"
                  : isCompleted
                    ? "text-emerald-400"
                    : "text-muted-foreground"
              }`}
            >
              {label}
            </span>
            {index < STEPS.length - 1 && (
              <div
                className={`absolute hidden h-0.5 w-full ${
                  isCompleted ? "bg-emerald-500" : "bg-border"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
