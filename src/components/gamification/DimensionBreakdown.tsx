"use client";

import { cn } from "@/lib/utils";
import { DIMENSION_CONFIG, type DimensionScore } from "./types";

/* ─── Props ─── */

interface DimensionBreakdownProps {
  dimensiones: DimensionScore[];
  compact?: boolean;
  className?: string;
}

/* ─── Component ─── */

export function DimensionBreakdown({
  dimensiones,
  compact = false,
  className,
}: DimensionBreakdownProps) {
  return (
    <div className={cn("space-y-3", compact && "space-y-2", className)}>
      {dimensiones.map((dim) => {
        const config = DIMENSION_CONFIG[dim.dimension] ?? {
          label: dim.label,
          color: "text-muted-foreground",
          bgColor: "bg-muted-foreground",
        };
        const clampedScore = Math.max(0, Math.min(100, dim.score));

        return (
          <div key={dim.dimension} className={cn("space-y-1", compact && "space-y-0.5")}>
            {/* Label row */}
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {config.label}
                <span className="ml-1 text-muted-foreground/60">
                  ({Math.round(dim.peso * 100)}%)
                </span>
              </span>
              <span className={cn("font-medium tabular-nums", config.color)}>
                {Math.round(clampedScore)}
              </span>
            </div>

            {/* Progress bar */}
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500 ease-out",
                  config.bgColor
                )}
                style={{ width: `${clampedScore}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
