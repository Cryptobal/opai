"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { getTrustScoreColor, getTrustScoreStrokeColor } from "./types";

/* ─── Size presets ─── */

const SIZE_MAP = {
  sm: { px: 80, stroke: 6 },
  md: { px: 120, stroke: 8 },
  lg: { px: 160, stroke: 10 },
} as const;

/* ─── Props ─── */

interface TrustScoreGaugeProps {
  score: number;
  size?: "sm" | "md" | "lg";
  className?: string;
  showLabel?: boolean;
}

/* ─── Component ─── */

export function TrustScoreGauge({
  score,
  size = "md",
  className,
  showLabel = false,
}: TrustScoreGaugeProps) {
  const { px, stroke } = SIZE_MAP[size];
  const radius = (px - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  const clampedScore = Math.max(0, Math.min(100, score));
  const offset = circumference - (clampedScore / 100) * circumference;
  const strokeColor = getTrustScoreStrokeColor(clampedScore);
  const textColor = getTrustScoreColor(clampedScore);

  const fontSize = useMemo(() => {
    if (size === "sm") return "text-lg";
    if (size === "md") return "text-2xl";
    return "text-4xl";
  }, [size]);

  return (
    <div className={cn("relative inline-flex flex-col items-center", className)}>
      {/* SVG gauge */}
      <div className="relative" style={{ width: px, height: px }}>
        <svg
          width={px}
          height={px}
          className="-rotate-90"
          aria-hidden="true"
        >
          {/* Background circle */}
          <circle
            cx={px / 2}
            cy={px / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            className="text-muted-foreground/15"
            stroke="currentColor"
          />

          {/* Progress arc */}
          <circle
            cx={px / 2}
            cy={px / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            stroke={strokeColor}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-700 ease-out"
          />
        </svg>

        {/* Score number overlay */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={cn("font-bold tabular-nums", fontSize, textColor)}>
            {Math.round(clampedScore)}
          </span>
        </div>
      </div>

      {/* Optional label */}
      {showLabel && (
        <span className="mt-1 text-xs text-muted-foreground">Trust Score</span>
      )}
    </div>
  );
}
