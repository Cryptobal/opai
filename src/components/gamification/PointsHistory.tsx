"use client";

import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { formatDateShort } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DIMENSION_CONFIG, type PointEvent } from "./types";

/* ─── Props ─── */

interface PointsHistoryProps {
  events: PointEvent[];
  compact?: boolean;
  className?: string;
  pageSize?: number;
  showFilter?: boolean;
}

/* ─── Component ─── */

export function PointsHistory({
  events,
  compact = false,
  className,
  pageSize = 10,
  showFilter = true,
}: PointsHistoryProps) {
  const [filter, setFilter] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(pageSize);

  /* Filtered events */
  const filtered = useMemo(() => {
    if (!filter) return events;
    return events.filter((e) => e.dimension === filter);
  }, [events, filter]);

  /* Paginated slice */
  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  /* Dimension filter options */
  const dimensionKeys = Object.keys(DIMENSION_CONFIG);

  return (
    <div className={cn("space-y-3", className)}>
      {/* Filter pills */}
      {showFilter && (
        <div className="flex flex-wrap gap-1.5">
          {/* "All" pill */}
          <button
            type="button"
            onClick={() => {
              setFilter(null);
              setVisibleCount(pageSize);
            }}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
              filter === null
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            Todas
          </button>

          {dimensionKeys.map((key) => {
            const dim = DIMENSION_CONFIG[key];
            const isActive = filter === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setFilter(isActive ? null : key);
                  setVisibleCount(pageSize);
                }}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  isActive
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {dim.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Event rows */}
      <div className={cn("space-y-1", compact && "space-y-0.5")}>
        {visible.map((event) => {
          const dimConfig = DIMENSION_CONFIG[event.dimension];
          const isPositive = event.puntos >= 0;

          return (
            <div
              key={event.id}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs",
                compact && "py-1"
              )}
            >
              {/* Description + date */}
              <div className="min-w-0 flex-1">
                <p className="truncate text-foreground">{event.descripcion}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDateShort(event.fecha)}
                </p>
              </div>

              {/* Dimension pill */}
              {dimConfig && (
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                    `${dimConfig.bgColor}/15`,
                    dimConfig.color
                  )}
                >
                  {dimConfig.label}
                </span>
              )}

              {/* Points */}
              <span
                className={cn(
                  "shrink-0 text-right font-medium tabular-nums",
                  isPositive ? "text-status-ok-fg" : "text-status-danger-fg"
                )}
              >
                {isPositive ? "+" : ""}
                {event.puntos}
              </span>
            </div>
          );
        })}
      </div>

      {/* Empty state */}
      {visible.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No hay eventos de puntos
        </p>
      )}

      {/* Load more */}
      {hasMore && (
        <div className="flex justify-center pt-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setVisibleCount((c) => c + pageSize)}
          >
            Ver mas
          </Button>
        </div>
      )}
    </div>
  );
}
