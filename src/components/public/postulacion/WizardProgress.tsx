"use client";

import type { LucideIcon } from "lucide-react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type StepMeta = { label: string; Icon: LucideIcon };

interface WizardProgressProps {
  steps: StepMeta[];
  step: number;
  maxStep: number;
  onStepClick: (idx: number) => void;
}

export function WizardProgress({ steps, step, maxStep, onStepClick }: WizardProgressProps) {
  const total = steps.length;
  const pct = Math.round(((step + 1) / total) * 100);

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-base font-semibold text-foreground">{steps[step].label}</p>
        <p className="shrink-0 text-xs font-medium text-muted-foreground">
          Paso {step + 1} de {total}
        </p>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex items-center justify-between">
        {steps.map((s, idx) => {
          const done = idx < step;
          const active = idx === step;
          const clickable = idx <= maxStep || idx === step + 1;
          const StepIcon = s.Icon;
          return (
            <button
              key={s.label}
              type="button"
              disabled={!clickable}
              onClick={() => onStepClick(idx)}
              aria-label={`Ir al paso ${idx + 1}: ${s.label}`}
              aria-current={active ? "step" : undefined}
              className={cn(
                "flex h-11 w-11 items-center justify-center rounded-full border transition-colors motion-reduce:transition-none",
                done && "border-status-ok-border bg-status-ok-soft text-status-ok-fg",
                active && "border-primary bg-primary text-primary-foreground",
                !done && !active && "border-border bg-muted text-muted-foreground",
                !clickable && "cursor-not-allowed opacity-60",
              )}
            >
              {done ? <Check className="h-5 w-5" /> : <StepIcon className="h-5 w-5" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
