"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type ResultTone = "ok" | "warn" | "bad";

export interface ResultScreenProps {
  tone: ResultTone;
  icon: ReactNode;
  title: string;
  who?: ReactNode;
  stamp?: ReactNode;
  meta?: ReactNode;
  footer?: ReactNode;
  className?: string;
}

const TONE: Record<ResultTone, { shell: string; title: string; stamp: string }> = {
  ok: {
    shell: "from-status-ok via-status-ok/80 to-background",
    title: "text-white",
    stamp: "text-white",
  },
  warn: {
    shell: "from-status-warn via-status-warn/80 to-background",
    title: "text-white",
    stamp: "text-white",
  },
  bad: {
    shell: "from-status-danger via-status-danger/80 to-background",
    title: "text-white",
    stamp: "text-white",
  },
};

export function ResultScreen({
  tone,
  icon,
  title,
  who,
  stamp,
  meta,
  footer,
  className,
}: ResultScreenProps) {
  const t = TONE[tone];

  return (
    <div
      role="status"
      aria-live="assertive"
      className={cn(
        "flex min-h-0 flex-1 flex-col bg-gradient-to-b",
        t.shell,
        className,
      )}
    >
      <div className="flex flex-1 flex-col items-center justify-center px-5 pb-8 pt-10 text-center">
        <div
          className={cn(
            "mb-5 flex h-24 w-24 items-center justify-center rounded-full bg-white/20 text-white",
            "motion-safe:animate-[terreno-pop_0.45s_cubic-bezier(0.22,1.2,0.36,1)_both]",
            "motion-reduce:animate-none",
          )}
        >
          {icon}
        </div>
        <h1 className={cn("font-display text-[26px] font-bold leading-tight tracking-wide sm:text-[27px]", t.title)}>
          {title}
        </h1>
        {who ? <div className="mt-2 text-lg font-semibold text-white/90">{who}</div> : null}
        {stamp ? (
          <div className={cn("mt-4 font-mono text-[44px] font-bold tabular-nums leading-none", t.stamp)}>
            {stamp}
          </div>
        ) : null}
        {meta ? (
          <div className="mt-5 flex max-w-sm flex-wrap items-center justify-center gap-2">{meta}</div>
        ) : null}
      </div>
      {footer ? (
        <div className="shrink-0 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] pt-2">
          {footer}
        </div>
      ) : null}
    </div>
  );
}

export function ResultMetaChip({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "ok" | "warn" | "bad";
}) {
  const cls =
    tone === "ok"
      ? "bg-status-ok-soft text-status-ok-fg border-status-ok-border"
      : tone === "warn"
        ? "bg-status-warn-soft text-status-warn-fg border-status-warn-border"
        : tone === "bad"
          ? "bg-status-danger-soft text-status-danger-fg border-status-danger-border"
          : "bg-white/20 text-white border-white/30";
  return (
    <span className={cn("inline-flex min-h-8 items-center rounded-full border px-3 text-[12px] font-medium", cls)}>
      {children}
    </span>
  );
}
