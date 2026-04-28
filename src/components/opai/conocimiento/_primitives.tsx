"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";

/* ─────────── Threshold helpers ─────────── */

export type Threshold = "ok" | "warn" | "danger" | "neutral";

/** ≥80 ok, 60-79 warn, <60 danger */
export function thresholdFromScore(score: number | null | undefined): Threshold {
  if (score == null) return "neutral";
  if (score >= 80) return "ok";
  if (score >= 60) return "warn";
  return "danger";
}

const TEXT: Record<Threshold, string> = {
  ok: "text-status-ok",
  warn: "text-status-warn",
  danger: "text-status-danger",
  neutral: "text-white/50",
};

const FILL: Record<Threshold, string> = {
  ok: "linear-gradient(90deg,#10B981,#34D399)",
  warn: "linear-gradient(90deg,#F59E0B,#FBBF24)",
  danger: "linear-gradient(90deg,#EF4444,#F87171)",
  neutral: "rgba(255,255,255,0.12)",
};

const BORDER_LEFT: Record<Threshold, string> = {
  ok: "bg-status-ok",
  warn: "bg-status-warn",
  danger: "bg-status-danger",
  neutral: "bg-white/20",
};

export const thresholdText = (t: Threshold) => TEXT[t];
export const thresholdFill = (t: Threshold) => FILL[t];
export const thresholdBorderLeft = (t: Threshold) => BORDER_LEFT[t];

/* ─────────── Bar ─────────── */

export function Bar({
  value,
  threshold,
  className,
}: { value: number; threshold?: Threshold; className?: string }) {
  const t = threshold ?? thresholdFromScore(value);
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("bar-mock", className)}>
      <i style={{ width: `${pct}%`, background: thresholdFill(t) }} />
    </div>
  );
}

/* ─────────── Pill ─────────── */

const PILL_VARIANTS = {
  ok: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  warn: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  danger: "border-red-500/30 bg-red-500/10 text-red-300",
  brand: "border-brand/30 bg-brand/10 text-brand2",
  neutral: "border-white/10 bg-white/[0.03] text-white/50",
} as const;

export function Pill({
  variant = "neutral",
  children,
  className,
}: {
  variant?: keyof typeof PILL_VARIANTS;
  children: ReactNode;
  className?: string;
}) {
  return <span className={cn("pill-mock", PILL_VARIANTS[variant], className)}>{children}</span>;
}

/* ─────────── KpiCard ─────────── */

export function KpiCard({
  label,
  value,
  hint,
  threshold,
  rightSlot,
  bar,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  threshold?: Threshold;
  rightSlot?: ReactNode;
  bar?: number;
  className?: string;
}) {
  return (
    <div className={cn("card-mock p-3.5", className)}>
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wider text-white/40 font-mono">{label}</div>
        {rightSlot}
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span
          className={cn(
            "font-display text-2xl font-bold num-tabular",
            threshold ? thresholdText(threshold) : "text-white",
          )}
        >
          {value}
        </span>
      </div>
      {bar !== undefined && (
        <div className="mt-1.5">
          <Bar value={bar} threshold={threshold} />
        </div>
      )}
      {hint && <div className="text-[10px] text-white/40 mt-1 font-mono">{hint}</div>}
    </div>
  );
}

/* ─────────── CompactKpi ─────────── */

export function CompactKpi({
  label,
  value,
  threshold,
  className,
}: {
  label: string;
  value: ReactNode;
  threshold?: Threshold;
  className?: string;
}) {
  return (
    <div className={cn("card-mock-tight px-3 py-2.5", className)}>
      <div className="text-[10px] uppercase tracking-wider text-white/40 font-mono">{label}</div>
      <div
        className={cn(
          "font-display text-base font-bold num-tabular leading-tight mt-0.5",
          threshold ? thresholdText(threshold) : "text-white",
        )}
      >
        {value}
      </div>
    </div>
  );
}

/* ─────────── StatusDot ─────────── */

export function StatusDot({
  threshold,
  pulse = false,
}: { threshold: Threshold; pulse?: boolean }) {
  const c = {
    ok: "bg-emerald-400",
    warn: "bg-amber-400",
    danger: "bg-red-500",
    neutral: "bg-white/30",
  }[threshold];
  return <span className={cn("badge-dot", c, pulse && "animate-pulse")} />;
}

/* ─────────── HeatmapCell ─────────── */

export function HeatmapCell({
  score,
  width = "w-6",
}: { score: number | null; width?: string }) {
  if (score == null) return <div className={cn("hm-cell bg-white/5", width)} />;
  const t = thresholdFromScore(score);
  const cls = {
    ok: "bg-emerald-500/80",
    warn: "bg-amber-500/80",
    danger: "bg-red-500/80",
    neutral: "bg-white/5",
  }[t];
  return <div className={cn("hm-cell", cls, width)} />;
}

/* ─────────── Blob ─────────── */

export function Blob({
  color = "brand",
  className,
}: {
  color?: "brand" | "danger" | "ok" | "warn";
  className?: string;
}) {
  const c = {
    brand: "bg-brand",
    danger: "bg-red-500",
    ok: "bg-emerald-500",
    warn: "bg-amber-500",
  }[color];
  return <div aria-hidden className={cn("absolute rounded-full blob-mock", c, className)} />;
}

/* ─────────── GrainOverlay ─────────── */

export function GrainOverlay() {
  return (
    <div
      aria-hidden
      className="absolute inset-0 pointer-events-none opacity-[0.025] bg-grain-svg"
    />
  );
}

/* ─────────── Avatar con iniciales (anonimización) ─────────── */

export function GuardAvatar({
  initials,
  threshold = "neutral",
  size = "md",
}: {
  initials: string;
  threshold?: Threshold;
  size?: "sm" | "md";
}) {
  const dim = size === "sm" ? "w-8 h-8 text-[10px]" : "w-9 h-9 text-[11px]";
  const grad = {
    ok: "bg-gradient-to-br from-emerald-400 to-emerald-600",
    warn: "bg-gradient-to-br from-amber-400 to-amber-600",
    danger: "bg-gradient-to-br from-red-400 to-red-600",
    neutral: "bg-white/5 border border-dashed border-white/20 text-white/40",
  }[threshold];
  return (
    <div
      className={cn(
        "rounded-full grid place-items-center text-white font-semibold shrink-0",
        dim,
        grad,
      )}
    >
      {initials}
    </div>
  );
}
