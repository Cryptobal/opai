"use client";

/**
 * WorkbenchGateRing — anillo de progreso documental (Centro de licitación).
 */

import { cn } from "@/lib/utils";

export function WorkbenchGateRing({
  done,
  total,
  label = "tipos de documento completos",
  hint,
  className,
}: {
  done: number;
  total: number;
  label?: string;
  hint?: string;
  className?: string;
}) {
  const safeTotal = Math.max(total, 1);
  const progress = Math.min(1, Math.max(0, done / safeTotal));
  const circ = 2 * Math.PI * 32;
  const offset = circ * (1 - progress);

  return (
    <div className={cn("flex items-center gap-3.5", className)}>
      <svg className="wb-ring-big" viewBox="0 0 76 76" aria-hidden>
        <circle className="wb-cring-track" cx="38" cy="38" r="32" />
        <circle
          className="wb-cring-prog"
          cx="38"
          cy="38"
          r="32"
          strokeDasharray={circ}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="min-w-0">
        <b className="font-mono text-[20px] font-extrabold text-ds-text-1">
          {done} / {total}
        </b>
        <small className="mt-0.5 block text-[12px] text-ds-text-3">{label}</small>
        {hint ? (
          <small className="mt-1 block text-[12px] text-status-warn-fg">{hint}</small>
        ) : null}
      </div>
    </div>
  );
}
