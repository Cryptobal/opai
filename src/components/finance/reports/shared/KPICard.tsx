"use client";

import { type LucideIcon, ArrowUpRight, ArrowDownRight } from "lucide-react";

type Tone = "emerald" | "sky" | "violet" | "amber" | "rose";

const TONE_VAR: Record<Tone, string> = {
  emerald: "var(--ds-tint-emerald)",
  sky: "var(--ds-tint-sky)",
  violet: "var(--ds-tint-violet)",
  amber: "var(--ds-tint-amber)",
  rose: "var(--ds-tint-rose)",
};

interface Props {
  label: string;
  value: string;
  delta?: number;
  sub?: string;
  icon?: LucideIcon;
  tone?: Tone;
}

export function KPICard({ label, value, delta, sub, icon: Icon, tone = "sky" }: Props) {
  const toneVar = TONE_VAR[tone];
  return (
    <div
      className="rounded-xl border bg-ds-surface p-3 md:p-4 relative overflow-hidden"
      style={{ borderColor: "var(--ds-border)" }}
    >
      <div
        className="absolute inset-y-0 left-0 w-0.5"
        style={{ background: toneVar }}
        aria-hidden="true"
      />
      <header className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-mono uppercase tracking-wider text-ds-text-3">
          {label}
        </span>
        {Icon && <Icon className="w-3.5 h-3.5" style={{ color: toneVar }} />}
      </header>
      <p
        className="text-[18px] md:text-[20px] font-semibold tabular-nums"
        style={{ fontFamily: "var(--font-display)", color: toneVar }}
      >
        {value}
      </p>
      {(delta !== undefined || sub) && (
        <div className="flex items-center gap-2 mt-1 text-[11px]">
          {delta !== undefined && (
            <span
              className="inline-flex items-center gap-0.5 font-mono"
              style={{ color: delta >= 0 ? "var(--ds-tint-emerald)" : "var(--ds-tint-rose)" }}
            >
              {delta >= 0 ? (
                <ArrowUpRight className="w-3 h-3" />
              ) : (
                <ArrowDownRight className="w-3 h-3" />
              )}
              {Math.abs(delta).toFixed(1)}%
            </span>
          )}
          {sub && <span className="text-ds-text-3">{sub}</span>}
        </div>
      )}
    </div>
  );
}
