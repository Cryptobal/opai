"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ProjectionBucket } from "@/modules/finance/cashflow/types";

interface Props {
  activeBucket: ProjectionBucket | null;
  isCurrent: boolean;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}

export function CashflowMobileWeeklyNav({
  activeBucket, isCurrent, hasPrev, hasNext, onPrev, onNext, onToday,
}: Props) {
  if (!activeBucket) return null;
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 bg-muted/30 rounded-ds-md">
      <button
        type="button"
        onClick={onPrev}
        disabled={!hasPrev}
        className="h-7 w-7 flex items-center justify-center text-ds-text-1 disabled:opacity-30"
        aria-label="Semana anterior"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </button>
      <div className="flex-1 text-center text-[11px] text-ds-text-2 truncate">
        {activeBucket.label}
        {isCurrent && (
          <span className="ml-1.5 text-status-info-fg font-medium">&middot; Esta semana</span>
        )}
      </div>
      {!isCurrent && (
        <button
          type="button"
          onClick={onToday}
          className="h-6 px-2 text-[10px] border border-border rounded-ds-sm text-ds-text-2 hover:bg-muted/60"
        >
          Hoy
        </button>
      )}
      <button
        type="button"
        onClick={onNext}
        disabled={!hasNext}
        className="h-7 w-7 flex items-center justify-center text-ds-text-1 disabled:opacity-30"
        aria-label="Semana siguiente"
      >
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
