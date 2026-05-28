"use client";

import { Lock } from "lucide-react";
import { StatusDot } from "@/components/opai-ds";
import { cn } from "@/lib/utils";
import type {
  ProjectionMatrix,
  ProjectionAnchorInfo,
} from "@/modules/finance/cashflow/types";
import { fmtCLP } from "./format";
import {
  isBucketClosed,
  isAnchorBucket,
  bucketHealthKind,
} from "./projection-helpers";

interface Props {
  projection: ProjectionMatrix;
  anchor: ProjectionAnchorInfo | null;
  currentIndex: number;
  selectedKey: string | null;
  onSelect: (key: string) => void;
}

/**
 * Tira horizontal de semanas/meses. Un chip por bucket con semáforo de salud,
 * saldo proyectado, candado si está cerrado y destaque de la semana actual.
 * El centro de comando: el usuario navega la línea de tiempo desde acá.
 */
export function WeekStrip({
  projection,
  anchor,
  currentIndex,
  selectedKey,
  onSelect,
}: Props) {
  const opening = projection.openingBalanceClp;
  return (
    <div className="-mx-4 px-4 sm:mx-0 sm:px-0">
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {projection.buckets.map((b, i) => {
          const point = projection.cumulativePoints[i];
          const projected = point?.projectedClp ?? 0;
          const closed = isBucketClosed(b, anchor);
          const anchored = isAnchorBucket(b, anchor);
          const isCurrent = i === currentIndex;
          const isSelected = b.key === selectedKey;
          const kind = bucketHealthKind(point?.projectedClp, opening);
          return (
            <button
              key={b.key}
              type="button"
              onClick={() => onSelect(b.key)}
              aria-pressed={isSelected}
              className={cn(
                "flex shrink-0 min-w-[120px] min-h-[60px] flex-col gap-1 rounded-ds-lg border px-3 py-2 text-left transition-colors",
                isSelected
                  ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                  : isCurrent
                    ? "border-primary/50 bg-primary/[0.06]"
                    : "border-ds-border-default bg-ds-surface-1 hover:border-ds-border-strong",
                closed && !isSelected && !isCurrent && "opacity-70",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5 text-[12px] font-medium text-ds-text-2">
                  <StatusDot kind={kind} />
                  <span className="truncate">{b.label}</span>
                </span>
                {closed && (
                  <Lock
                    className="h-3 w-3 shrink-0 text-ds-text-3"
                    aria-label="semana cerrada"
                  />
                )}
              </div>
              <span
                className={cn(
                  "font-mono text-sm tabular-nums",
                  projected < 0 ? "text-status-danger-fg" : "text-ds-text-1",
                )}
              >
                {fmtCLP.format(projected)}
              </span>
              {anchored && (
                <span className="text-[9px] font-mono uppercase tracking-wide text-primary">
                  ancla
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
