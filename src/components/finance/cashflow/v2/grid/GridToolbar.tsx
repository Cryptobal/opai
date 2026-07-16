"use client";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { HorizonSelector } from "./HorizonSelector";
import type { HorizonWeeks } from "./useHorizon";
import { CashflowFolioSearch } from "./CashflowFolioSearch";
import type { ProjectionBucket } from "@/modules/finance/cashflow/types";

/**
 * Toolbar de la planilla: título, buscador de folio, horizonte, Hoy y flechas.
 */
export function GridToolbar({
  isMobile,
  horizon,
  setHorizon,
  buckets,
  canManage,
  loading,
  onRunFolio,
  onLocate,
  onToday,
  onPrev,
  onNext,
}: {
  isMobile: boolean;
  horizon: HorizonWeeks;
  setHorizon: (h: HorizonWeeks) => void;
  buckets: ProjectionBucket[];
  canManage: boolean;
  loading: boolean;
  onRunFolio: (dteId: string, date: Date) => Promise<{ ok: boolean; error?: string }>;
  onLocate: (date: Date) => void;
  onToday: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-sm font-semibold text-ds-text-1">
        Planilla de flujo · {isMobile ? "3" : horizon} semanas
      </h2>
      {!isMobile && (
        <CashflowFolioSearch
          buckets={buckets}
          canManage={canManage}
          onRun={onRunFolio}
          onLocate={onLocate}
        />
      )}
      <div className="flex items-center gap-1">
        {!isMobile && (
          <HorizonSelector value={horizon} onChange={setHorizon} />
        )}
        <button
          type="button"
          onClick={onToday}
          aria-label="Volver a hoy"
          title="Volver a la semana actual"
          className="mr-1 inline-flex h-10 items-center gap-1.5 rounded-ds-md border border-ds-border-default px-2.5 text-[12px] text-ds-text-2 transition-colors hover:bg-ds-surface-2 hover:text-ds-text-1 sm:h-9"
        >
          <CalendarDays className="h-3.5 w-3.5" /> Hoy
        </button>
        <NavButton dir="prev" onClick={onPrev} loading={loading} label="Semana anterior" />
        <NavButton dir="next" onClick={onNext} loading={loading} label="Semana siguiente" />
      </div>
    </div>
  );
}

function NavButton({
  dir,
  onClick,
  loading,
  label,
}: {
  dir: "prev" | "next";
  onClick: () => void;
  loading: boolean;
  label: string;
}) {
  const Icon = dir === "prev" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-busy={loading || undefined}
      className="inline-flex h-10 w-10 items-center justify-center rounded-ds-md border border-ds-border-default text-ds-text-2 transition-colors hover:bg-ds-surface-2 hover:text-ds-text-1 sm:h-9 sm:w-9"
    >
      <Icon className={cn("h-4 w-4", loading && "motion-safe:animate-pulse")} />
    </button>
  );
}
