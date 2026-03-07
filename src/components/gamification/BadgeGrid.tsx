"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { BadgeData } from "./types";
import { BadgeCard } from "./BadgeCard";

/* ─── Props ─── */

interface BadgeGridProps {
  badges: BadgeData[];
  compact?: boolean;
  className?: string;
  onBadgeClick?: (badge: BadgeData) => void;
}

/* ─── Component ─── */

export function BadgeGrid({
  badges,
  compact = false,
  className,
  onBadgeClick,
}: BadgeGridProps) {
  const { earned, notEarned } = useMemo(() => {
    const earned: BadgeData[] = [];
    const notEarned: BadgeData[] = [];

    for (const b of badges) {
      if (b.ganado) {
        earned.push(b);
      } else if (!b.secreto) {
        // Filter out secret badges from not-earned
        notEarned.push(b);
      }
    }

    return { earned, notEarned };
  }, [badges]);

  const gridCols = compact
    ? "grid-cols-4"
    : "grid-cols-3 sm:grid-cols-4 md:grid-cols-5";

  return (
    <div className={cn("space-y-4", className)}>
      {/* Earned badges */}
      {earned.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground">
            Obtenidos ({earned.length})
          </h4>
          <div className={cn("grid gap-2", gridCols)}>
            {earned.map((badge) => (
              <BadgeCard
                key={badge.id}
                badge={badge}
                compact={compact}
                onClick={onBadgeClick}
              />
            ))}
          </div>
        </div>
      )}

      {/* Not-earned badges */}
      {notEarned.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground">
            Por desbloquear
          </h4>
          <div className={cn("grid gap-2", gridCols)}>
            {notEarned.map((badge) => (
              <BadgeCard
                key={badge.id}
                badge={badge}
                compact={compact}
                onClick={onBadgeClick}
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {earned.length === 0 && notEarned.length === 0 && (
        <p className="py-4 text-center text-sm text-muted-foreground">
          No hay badges disponibles
        </p>
      )}
    </div>
  );
}
