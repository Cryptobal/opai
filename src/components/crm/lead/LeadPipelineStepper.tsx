"use client";

import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * LeadPipelineStepper — stepper de estado del lead para el `pipelineBar`
 * del EntityDetailLayout: Pendiente → En revisión → Aprobado (o Rechazado).
 * Scroller horizontal con fade lateral en pantallas angostas.
 */
export function LeadPipelineStepper({ status }: { status: string }) {
  const rejected = status === "rejected";
  const steps = [
    { id: "pending", label: "Pendiente" },
    { id: "in_review", label: "En revisión" },
    rejected ? { id: "rejected", label: "Rechazado" } : { id: "approved", label: "Aprobado" },
  ];
  const currentIdx = rejected || status === "approved" ? 2 : status === "in_review" ? 1 : 0;

  return (
    <div
      className="flex items-center gap-1.5 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_right,transparent,black_12px,black_calc(100%-12px),transparent)]"
      aria-label="Estado del lead"
    >
      {steps.map((step, i) => {
        const done = i < currentIdx;
        const current = i === currentIdx;
        const isDangerStep = step.id === "rejected" && current;
        return (
          <div key={step.id} className="flex shrink-0 items-center gap-1.5">
            {i > 0 && <span className="h-px w-4 sm:w-6 bg-ds-border-default" aria-hidden />}
            <span
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium whitespace-nowrap",
                isDangerStep
                  ? "border-status-danger-border bg-status-danger-soft text-status-danger-fg"
                  : current
                    ? "border-status-ok-border bg-status-ok-soft text-status-ok-fg"
                    : done
                      ? "border-status-ok-border/50 text-status-ok-fg/80"
                      : "border-ds-border-default text-ds-text-3"
              )}
              aria-current={current ? "step" : undefined}
            >
              {isDangerStep ? (
                <X className="h-3.5 w-3.5" aria-hidden />
              ) : done || (current && i === 2) ? (
                <Check className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <span
                  className={cn(
                    "inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-semibold",
                    current ? "bg-status-ok text-white" : "bg-ds-surface-2 text-ds-text-3"
                  )}
                >
                  {i + 1}
                </span>
              )}
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
