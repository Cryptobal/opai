"use client";

import React from "react";
import { cn } from "@/lib/utils";

type MetricTone = "ok" | "warn" | "info" | "neutral";

interface MetricCardProps {
  value: string | number;
  label: string;
  icon?: React.ReactNode;
  tone?: MetricTone;
  /** @deprecated use tone */
  color?: string;
}

const TONE: Record<MetricTone, string> = {
  ok: "text-status-ok-fg",
  warn: "text-status-warn-fg",
  info: "text-status-info-fg",
  neutral: "text-ds-text-1",
};

export default function MetricCard({
  value,
  label,
  icon,
  tone = "info",
}: MetricCardProps) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-ds-border-default bg-ds-surface-1 p-4 opai-glass-soft-m">
      <div className="flex items-center justify-between">
        <span className={cn("font-mono text-3xl font-bold tabular-nums tracking-tight", TONE[tone])}>
          {value}
        </span>
        {icon && <span className={cn("text-ds-text-3", TONE[tone])}>{icon}</span>}
      </div>
      <span className="text-[12px] font-medium uppercase tracking-wide text-ds-text-3">
        {label}
      </span>
    </div>
  );
}
