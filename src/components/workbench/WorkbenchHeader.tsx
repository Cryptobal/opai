"use client";

/**
 * WorkbenchHeader — header card desktop (icon tile + eyebrow + título +
 * estado/acciones + fila 2: PulseBar inline + Journey).
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function WorkbenchHeader({
  icon,
  eyebrow,
  title,
  statusSlot,
  actions,
  pulse,
  journey,
  className,
}: {
  icon: ReactNode;
  eyebrow: ReactNode;
  title: ReactNode;
  statusSlot?: ReactNode;
  actions?: ReactNode;
  pulse?: ReactNode;
  journey?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "mb-4 hidden rounded-[20px] border border-[var(--glass-border)] p-[18px_20px_16px] lg:block",
        "bg-[var(--glass-fill)] shadow-[var(--glass-specular),0_10px_34px_rgba(0,0,0,0.32)]",
        className,
      )}
    >
      <div className="flex items-center gap-3.5">
        <span
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-[15px] text-[var(--ds-glow)]",
            "bg-[linear-gradient(180deg,rgba(var(--ds-glow-rgb),0.18),rgba(20,168,138,0.06))]",
            "shadow-[inset_0_0_0_1px_rgba(var(--ds-glow-rgb),0.25),0_6px_18px_rgba(20,168,138,0.2)]",
          )}
          aria-hidden
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-extrabold uppercase tracking-[0.16em] text-ds-text-3">
            {eyebrow}
          </p>
          <h1 className="truncate font-display text-[21px] font-extrabold tracking-tight text-ds-text-1">
            {title}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {statusSlot}
          {actions}
        </div>
      </div>
      {(pulse || journey) && (
        <div className="mt-3.5 flex items-center gap-4 border-t border-white/[0.07] pt-3.5">
          {pulse ? (
            <div className="min-w-[190px] shrink-0">{pulse}</div>
          ) : null}
          {journey ? <div className="min-w-0 flex-1">{journey}</div> : null}
        </div>
      )}
    </header>
  );
}
