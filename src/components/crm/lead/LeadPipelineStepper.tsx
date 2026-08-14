"use client";

import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * LeadPipelineStepper — Pendiente → En revisión → Aprobado / Rechazado.
 */
export function LeadPipelineStepper({
  status,
}: {
  status: string;
  firstContactAt?: Date | string | null;
}) {
  const rejected = status === "rejected";
  const approved = status === "approved";

  const steps = [
    { id: "pending", label: "Pendiente" },
    { id: "in_review", label: "En revisión" },
    { id: "final", label: rejected ? "Rechazado" : "Aprobado" },
  ] as const;

  let currentIdx = 0;
  if (approved || rejected) currentIdx = 2;
  else if (status === "in_review") currentIdx = 1;

  return (
    <div
      className="flex items-center gap-1.5 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      aria-label="Estado del lead"
    >
      {steps.map((step, i) => {
        const isCurrent = i === currentIdx;
        const isDone = i < currentIdx;
        const finalDanger = step.id === "final" && rejected;

        return (
          <div key={step.id} className="flex shrink-0 items-center gap-1.5">
            {i > 0 && <span className="h-px w-4 bg-ds-border-default sm:w-6" aria-hidden />}
            <span
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium whitespace-nowrap",
                isCurrent && finalDanger
                  ? "border-status-danger-border bg-status-danger-soft text-status-danger-fg"
                  : isCurrent
                    ? "border-status-ok-border bg-status-ok-soft text-status-ok-fg"
                    : isDone
                      ? "border-status-ok-border/50 text-status-ok-fg/80"
                      : "border-ds-border-default text-ds-text-3",
              )}
              aria-current={isCurrent ? "step" : undefined}
            >
              {isDone || (isCurrent && (approved || rejected)) ? (
                rejected && isCurrent ? <X className="h-3.5 w-3.5" aria-hidden /> : <Check className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <span
                  className={cn(
                    "inline-flex h-4 w-4 items-center justify-center rounded-full text-[12px] font-semibold leading-none",
                    isCurrent ? "bg-status-ok text-white" : "bg-ds-surface-2 text-ds-text-3",
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
