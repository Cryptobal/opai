"use client";

import { Check, Ban } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * LeadPathStepper — riel de etapas del lead (patrón Salesforce), siempre visible.
 * Solo presentación. Deriva las etapas del status + firstContactAt.
 */
export interface LeadPathStepperProps {
  status: "pending" | "in_review" | "approved" | "rejected" | string;
  firstContactAt: Date | string | null;
  className?: string;
}

type StepState = "done" | "active" | "pending";

export function LeadPathStepper({ status, firstContactAt, className }: LeadPathStepperProps) {
  if (status === "rejected") {
    return (
      <div className={cn("flex", className)} role="list" aria-label="Etapa del lead">
        <span className="sr-only">Etapa del lead: rechazado</span>
        <span
          role="listitem"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-status-danger-border bg-status-danger-soft px-3.5 text-sm font-semibold text-status-danger-fg"
        >
          <Ban className="h-3.5 w-3.5" aria-hidden />
          Rechazado
        </span>
      </div>
    );
  }

  const contacted = Boolean(firstContactAt);
  const approved = status === "approved";

  const steps: { key: string; label: string; state: StepState }[] = [
    { key: "review", label: "En revisión", state: contacted || approved ? "done" : "active" },
    {
      key: "contacted",
      label: "Contactado",
      state: approved ? "done" : contacted ? "active" : "pending",
    },
    { key: "approved", label: "Aprobado", state: approved ? "active" : "pending" },
  ];

  return (
    <div
      className={cn("flex gap-1.5 overflow-x-auto scrollbar-thin", className)}
      role="list"
      aria-label="Etapa del lead"
    >
      <span className="sr-only">Etapa del lead:</span>
      {steps.map((step) => (
        <span
          key={step.key}
          role="listitem"
          aria-current={step.state === "active" ? "step" : undefined}
          className={cn(
            "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition-colors motion-reduce:transition-none",
            step.state === "active" && "bg-primary text-primary-foreground shadow",
            step.state === "done" && "bg-status-ok-soft text-status-ok-fg",
            step.state === "pending" && "border border-ds-border-default bg-ds-surface-1 text-ds-text-3",
          )}
        >
          {step.state === "done" && <Check className="h-3.5 w-3.5" aria-hidden />}
          {step.label}
        </span>
      ))}
    </div>
  );
}
