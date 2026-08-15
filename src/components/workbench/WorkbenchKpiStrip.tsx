"use client";

/**
 * WorkbenchKpiStrip — KPI strip glass con glow radial semántico (listas).
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type WorkbenchKpiTone = "brand" | "warn" | "ok" | "danger" | "info";

const TONE_GLOW: Record<WorkbenchKpiTone, string> = {
  brand: "rgba(var(--ds-glow-rgb),0.18)",
  warn: "rgba(245,165,36,0.18)",
  ok: "rgba(52,211,153,0.18)",
  danger: "rgba(248,113,113,0.16)",
  info: "rgba(96,165,250,0.18)",
};

const TONE_VALUE: Record<WorkbenchKpiTone, string> = {
  brand: "text-[var(--ds-glow)]",
  warn: "text-status-warn-fg",
  ok: "text-status-ok-fg",
  danger: "text-status-danger-fg",
  info: "text-status-info-fg",
};

export interface WorkbenchKpiItem {
  id: string;
  label: string;
  value: ReactNode;
  tone?: WorkbenchKpiTone;
  selected?: boolean;
  onClick?: () => void;
}

export function WorkbenchKpiStrip({
  items,
  className,
}: {
  items: WorkbenchKpiItem[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-3.5 grid grid-cols-2 gap-2.5 sm:grid-cols-4",
        className,
      )}
      role="group"
    >
      {items.map((item) => {
        const tone = item.tone ?? "brand";
        const Comp = item.onClick ? "button" : "div";
        return (
          <Comp
            key={item.id}
            type={item.onClick ? "button" : undefined}
            onClick={item.onClick}
            className={cn(
              "relative overflow-hidden rounded-2xl border border-[var(--glass-border)] px-3.5 py-3 text-left transition",
              "bg-[var(--glass-fill)] shadow-[var(--glass-specular),0_6px_24px_rgba(0,0,0,0.28)]",
              item.onClick && "active:scale-[0.97]",
              item.selected &&
                "border-[rgba(var(--ds-glow-rgb),0.4)] shadow-[var(--glass-specular),0_0_0_1px_rgba(var(--ds-glow-rgb),0.25),0_6px_24px_rgba(0,0,0,0.28)]",
            )}
          >
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-[-20%] top-[-30%] h-[90%] rounded-full"
              style={{
                background: `radial-gradient(circle, ${TONE_GLOW[tone]}, transparent 70%)`,
              }}
            />
            <i className="relative block text-[12px] font-bold not-italic uppercase tracking-[0.12em] text-ds-text-3">
              {item.label}
            </i>
            <b
              className={cn(
                "relative mt-1 block font-mono text-[23px] font-extrabold tracking-tight",
                TONE_VALUE[tone],
              )}
            >
              {item.value}
            </b>
          </Comp>
        );
      })}
    </div>
  );
}
