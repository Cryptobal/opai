"use client";

import { ChevronLeft, ChevronRight, CheckCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AsistenciaMetrics } from "@/types/ops-asistencia";

const DATE_LABEL = new Intl.DateTimeFormat("es-CL", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

function formatDateLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  if (!y || !m || !d) return dateKey;
  return DATE_LABEL.format(new Date(y, m - 1, d));
}

interface AsistenciaDiaSheetHeaderProps {
  date: string;
  installationName: string;
  metrics: AsistenciaMetrics;
  canGoPrev: boolean;
  canGoNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  canExecuteOps: boolean;
  eligibleCount: number;
  bulkLoading: boolean;
  onBulkMark: () => void;
  pendientes: number;
}

export function AsistenciaDiaSheetHeader({
  date,
  installationName,
  metrics,
  canGoPrev,
  canGoNext,
  onPrev,
  onNext,
  canExecuteOps,
  eligibleCount,
  bulkLoading,
  onBulkMark,
  pendientes,
}: AsistenciaDiaSheetHeaderProps) {
  return (
    <div className="space-y-3 shrink-0 border-b border-ds-border-subtle pb-3">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-10 w-10 sm:h-9 sm:w-9 shrink-0"
          disabled={!canGoPrev}
          onClick={onPrev}
          aria-label="Día anterior"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0 text-center">
          <div className="font-display text-base font-semibold capitalize truncate">
            {formatDateLabel(date)}
          </div>
          <div className="text-[13px] text-ds-text-3 truncate">{installationName}</div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-10 w-10 sm:h-9 sm:w-9 shrink-0"
          disabled={!canGoNext}
          onClick={onNext}
          aria-label="Día siguiente"
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      <div className="grid grid-cols-4 gap-1.5 text-center">
        {[
          { label: "Turnos", value: metrics.total },
          { label: "Cubiertos", value: metrics.cubiertos },
          { label: "PPC", value: metrics.ppc },
          { label: "Pendientes", value: pendientes },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-lg bg-ds-surface-2 px-1 py-1.5 border border-ds-border-subtle"
          >
            <div className="font-mono text-sm font-semibold tabular-nums">{kpi.value}</div>
            <div className="text-[12px] text-ds-text-3 leading-tight">{kpi.label}</div>
          </div>
        ))}
      </div>

      {canExecuteOps && (
        <Button
          type="button"
          variant="outline"
          className="w-full h-10 sm:h-9 gap-2"
          disabled={eligibleCount === 0 || bulkLoading}
          onClick={onBulkMark}
        >
          {bulkLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCheck className="h-4 w-4" />
          )}
          {eligibleCount > 0
            ? `Marcar ${eligibleCount} turno${eligibleCount === 1 ? "" : "s"} como asistidos`
            : "Marcar todos con horario planificado"}
        </Button>
      )}
    </div>
  );
}
