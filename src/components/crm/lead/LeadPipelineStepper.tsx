"use client";

import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * LeadPipelineStepper — único riel de etapas del lead (pipelineBar):
 * Pendiente → En revisión → Contactado → Aprobado (o Rechazado).
 */
export function LeadPipelineStepper({
  status,
  firstContactAt,
}: {
  status: string;
  firstContactAt?: Date | string | null;
}) {
  if (status === "rejected") {
    return (
      <div
        className="flex items-center gap-1.5 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label="Estado del lead"
      >
        <span
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-status-danger-border bg-status-danger-soft px-2.5 text-[12px] font-medium text-status-danger-fg whitespace-nowrap"
          aria-current="step"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
          Rechazado
        </span>
      </div>
    );
  }

  const contacted = Boolean(firstContactAt);
  const approved = status === "approved";

  const steps = [
    { id: "pending", label: "Pendiente" },
    { id: "in_review", label: "En revisión" },
    { id: "contacted", label: "Contactado" },
    { id: "approved", label: "Aprobado" },
  ] as const;

  // Índice activo: pending=0 · in_review=1 · contactado=2 · aprobado=3
  let currentIdx = 0;
  if (approved) currentIdx = 3;
  else if (contacted) currentIdx = 2;
  else if (status === "in_review") currentIdx = 1;

  return (
    <div
      className="flex items-center gap-1.5 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_right,transparent,black_12px,black_calc(100%-12px),transparent)]"
      aria-label="Estado del lead"
    >
      {steps.map((step, i) => {
        const isCurrent = i === currentIdx;
        // Contactado solo queda "hecho" si hubo primer contacto real.
        const isDone =
          step.id === "contacted"
            ? contacted && i < currentIdx
            : i < currentIdx;

        return (
          <div key={step.id} className="flex shrink-0 items-center gap-1.5">
            {i > 0 && <span className="h-px w-4 sm:w-6 bg-ds-border-default" aria-hidden />}
            <span
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium whitespace-nowrap",
                isCurrent
                  ? "border-status-ok-border bg-status-ok-soft text-status-ok-fg"
                  : isDone
                    ? "border-status-ok-border/50 text-status-ok-fg/80"
                    : "border-ds-border-default text-ds-text-3"
              )}
              aria-current={isCurrent ? "step" : undefined}
            >
              {isDone || (isCurrent && approved) ? (
                <Check className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <span
                  className={cn(
                    "inline-flex h-4 w-4 items-center justify-center rounded-full text-[12px] font-semibold leading-none",
                    isCurrent ? "bg-status-ok text-white" : "bg-ds-surface-2 text-ds-text-3"
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
