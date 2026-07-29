"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  /** true mientras el turno está en curso */
  active: boolean;
  /** texto acumulado de razonamiento */
  text: string;
  /** label de la tool en ejecución, si hay */
  toolLabel: string | null;
  /** pasos completados */
  steps: number;
  /** ms totales; solo en estado colapsado */
  elapsedMs?: number;
};

function formatElapsed(ms: number): string {
  const seconds = ms / 1000;
  return seconds.toLocaleString("es-CL", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

export function ReasoningTrace({ active, text, toolLabel, steps, elapsedMs }: Props) {
  const [expanded, setExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!active) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [active, text]);

  if (!active && !text.trim()) return null;

  if (active) {
    return (
      <div className="mr-auto max-w-[95%] space-y-1.5 px-1">
        <div className="flex items-center gap-1.5 text-xs text-status-info-fg/80">
          <span className="inline-flex gap-1" aria-hidden>
            <span className="h-1.5 w-1.5 rounded-full bg-status-info animate-bounce [animation-delay:0ms]" />
            <span className="h-1.5 w-1.5 rounded-full bg-status-info animate-bounce [animation-delay:120ms]" />
            <span className="h-1.5 w-1.5 rounded-full bg-status-info animate-bounce [animation-delay:240ms]" />
          </span>
          <span>{toolLabel ?? "Pensando…"}</span>
        </div>
        {text.trim() ? (
          <div
            ref={scrollRef}
            className={cn(
              "max-h-24 sm:max-h-32 overflow-y-auto whitespace-pre-wrap text-[12px] text-ds-text-3 leading-relaxed",
              "[mask-image:linear-gradient(to_bottom,black_70%,transparent_100%)]",
              "[-webkit-mask-image:linear-gradient(to_bottom,black_70%,transparent_100%)]",
            )}
          >
            {text}
          </div>
        ) : null}
      </div>
    );
  }

  const stepLabel = steps > 0 ? `${steps} paso${steps === 1 ? "" : "s"}` : null;
  const elapsedLabel =
    typeof elapsedMs === "number" && elapsedMs > 0
      ? `Pensó durante ${formatElapsed(elapsedMs)} s`
      : "Pensó";
  const summary = [elapsedLabel, stepLabel].filter(Boolean).join(" · ");

  return (
    <div className="mr-auto max-w-[95%]">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="inline-flex h-11 sm:h-8 items-center gap-1 rounded-md px-1.5 text-[12px] text-ds-text-3 hover:bg-ds-surface-2 hover:text-ds-text-2 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
        )}
        <span>{summary}</span>
      </button>
      <div
        className={cn(
          "overflow-hidden transition-[max-height] duration-200",
          expanded ? "max-h-32 sm:max-h-40" : "max-h-0",
        )}
      >
        <div className="max-h-24 sm:max-h-32 overflow-y-auto whitespace-pre-wrap px-1.5 pb-1 text-[12px] text-ds-text-3 leading-relaxed">
          {text}
        </div>
      </div>
    </div>
  );
}
