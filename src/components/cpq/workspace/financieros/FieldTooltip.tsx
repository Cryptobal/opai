"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/** Tooltip normativo accesible por teclado para campos de Financieros. */
export function FieldTooltip({
  label,
  text,
  className,
}: {
  label: string;
  text: string;
  className?: string;
}) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex h-11 w-11 sm:h-6 sm:w-6 items-center justify-center rounded-full text-ds-text-3 hover:text-ds-text-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
              className,
            )}
            aria-label={`Ayuda: ${label}`}
          >
            <HelpCircle className="h-3.5 w-3.5" aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          align="end"
          role="tooltip"
          className="max-w-[280px] text-[12px] leading-relaxed sm:max-w-xs"
        >
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
