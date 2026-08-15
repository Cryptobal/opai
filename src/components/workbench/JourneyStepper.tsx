"use client";

/**
 * JourneyStepper — stepper líquido con pill activa `wb-breathe`.
 * Pasos por props; sin lógica de negocio.
 */

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface JourneyStep {
  id: string;
  label: string;
}

export function JourneyStepper({
  steps,
  activeIndex,
  className,
}: {
  steps: JourneyStep[];
  /** Índice 0-based del paso activo. Pasos anteriores = done. */
  activeIndex: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1 overflow-x-auto rounded-full border border-white/[0.06] bg-black/18 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        "shadow-[inset_0_1px_3px_rgba(0,0,0,0.4),inset_0_-1px_0_rgba(255,255,255,0.05)]",
        className,
      )}
      role="list"
      aria-label="Progreso"
    >
      {steps.map((step, i) => {
        const done = i < activeIndex;
        const active = i === activeIndex;
        return (
          <div key={step.id} className="flex min-w-0 shrink-0 items-center gap-1">
            {i > 0 ? (
              <span
                className="mx-0.5 h-[1.5px] min-w-3 flex-1 bg-gradient-to-r from-white/16 to-white/6"
                aria-hidden
              />
            ) : null}
            <span
              role="listitem"
              aria-current={active ? "step" : undefined}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[12px] font-medium",
                done && "text-ds-text-2",
                active &&
                  "wb-breathe border border-[rgba(var(--ds-glow-rgb),0.45)] font-bold text-[#eafff8]",
                active &&
                  "bg-[linear-gradient(180deg,rgba(var(--ds-glow-rgb),0.28),rgba(20,168,138,0.14)),var(--glass-fill)]",
                !done && !active && "text-ds-text-3",
              )}
            >
              <span
                className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-[1.5px]",
                  done &&
                    "border-[rgba(var(--ds-glow-rgb),0.6)] bg-[rgba(20,168,138,0.22)] text-[var(--ds-glow)]",
                  active &&
                    "border-transparent bg-[var(--ds-glow)] shadow-[0_0_12px_rgba(var(--ds-glow-rgb),0.8)]",
                  !done && !active && "border-white/22",
                )}
                aria-hidden
              >
                {done ? <Check className="h-2.5 w-2.5" strokeWidth={3} /> : null}
              </span>
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Journey canónico Lead: Nuevo → En revisión → Convertido. */
export const LEAD_JOURNEY: JourneyStep[] = [
  { id: "nuevo", label: "Nuevo" },
  { id: "revision", label: "En revisión" },
  { id: "convertido", label: "Convertido" },
];

/** Journey canónico Cotización: Borrador → Enviada → Aprobada. */
export const QUOTE_JOURNEY: JourneyStep[] = [
  { id: "draft", label: "Borrador" },
  { id: "sent", label: "Enviada" },
  { id: "approved", label: "Aprobada" },
];

/** Journey canónico Licitación: Preparación → Consultas → Presentada → Adjudicación. */
export const TENDER_JOURNEY: JourneyStep[] = [
  { id: "prep", label: "Preparación" },
  { id: "consultas", label: "Consultas" },
  { id: "presentada", label: "Presentada" },
  { id: "adjudicacion", label: "Adjudicación" },
];
