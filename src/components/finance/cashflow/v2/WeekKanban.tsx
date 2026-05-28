"use client";

import { useMemo } from "react";
import { Lock } from "lucide-react";
import type {
  ProjectionMatrix,
  ProjectionAnchorInfo,
  VirtualOccurrence,
} from "@/modules/finance/cashflow/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WeekDetail } from "./WeekDetail";
import { fmtCLP } from "./format";
import {
  isBucketClosed,
  currentBucketIndex,
  type OccMeta,
} from "./projection-helpers";

interface Props {
  projection: ProjectionMatrix;
  anchor: ProjectionAnchorInfo | null;
  meta: Map<string, OccMeta>;
  canManage: boolean;
  /** Cantidad de columnas visibles (default 4). */
  visibleCount?: number;
  /** Si true, centra la ventana mostrando 1 semana atrás + las siguientes. */
  centerOnCurrent?: boolean;
  searchTerm?: string;
  onMove?: (occurrence: VirtualOccurrence) => void;
  onMoveDir?: (occurrence: VirtualOccurrence, fromKey: string, dir: "left" | "right") => void;
  onOpenDetail?: (occurrence: VirtualOccurrence, meta?: OccMeta) => void;
  onCloseWeek?: (bucketKey: string) => void;
  onMutate?: () => void;
}

/**
 * Kanban paralelo de columnas semanales para desktop. Muestra N buckets lado a
 * lado (default 4), centrados alrededor de la semana actual. Cada columna tiene
 * su header con saldo proyectado, candado si está cerrada, botón "Cuadrar y
 * cerrar" si es accionable, y el detalle Entra/Sale con flechas ← →.
 */
export function WeekKanban({
  projection,
  anchor,
  meta,
  canManage,
  visibleCount = 4,
  centerOnCurrent = true,
  searchTerm,
  onMove,
  onMoveDir,
  onOpenDetail,
  onCloseWeek,
  onMutate,
}: Props) {
  const currentIdx = currentBucketIndex(projection.buckets);
  const projectedByKey = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of projection.cumulativePoints) m.set(p.bucketKey, p.projectedClp);
    return m;
  }, [projection.cumulativePoints]);

  const startIdx = centerOnCurrent ? Math.max(0, currentIdx - 1) : 0;
  const buckets = projection.buckets.slice(startIdx, startIdx + visibleCount);

  return (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: `repeat(${buckets.length}, minmax(0, 1fr))` }}
    >
      {buckets.map((b) => {
        const idx = projection.buckets.indexOf(b);
        const closed = isBucketClosed(b, anchor);
        const isCurrent = idx === currentIdx;
        const isPast = currentIdx >= 0 && idx < currentIdx;
        const canCloseHere = !closed && (isCurrent || isPast);
        const projected = projectedByKey.get(b.key) ?? b.net;
        const canLeft = idx > 0;
        const canRight = idx < projection.buckets.length - 1;
        return (
          <div
            key={b.key}
            className={cn(
              "flex flex-col rounded-ds-lg border bg-ds-surface-1",
              isCurrent
                ? "border-primary shadow-ds-md"
                : "border-ds-border-default",
            )}
          >
            <div
              className={cn(
                "border-b border-ds-border-default px-3 py-2",
                isCurrent && "bg-primary/5",
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-bold text-ds-text-1">{b.label}</span>
                {closed && (
                  <Lock className="h-3 w-3 text-status-ok-fg" aria-label="semana cerrada" />
                )}
              </div>
              <div className="mt-0.5 text-[10px] text-ds-text-3">cierre proy.</div>
              <div
                className="font-mono text-base font-bold tabular-nums"
                style={{
                  color:
                    projected < 0
                      ? "var(--ds-danger)"
                      : isCurrent
                        ? "var(--primary)"
                        : "var(--ds-text-1)",
                }}
              >
                {fmtCLP.format(projected)}
              </div>
              {canCloseHere && canManage && onCloseWeek && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 h-7 w-full text-[11px]"
                  onClick={() => onCloseWeek(b.key)}
                >
                  <Lock className="mr-1 h-3 w-3" /> Cuadrar y cerrar
                </Button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-2" style={{ maxHeight: 560 }}>
              <WeekDetail
                bucket={b}
                meta={meta}
                canManage={canManage}
                searchTerm={searchTerm}
                onMove={onMove}
                onMoveDir={
                  onMoveDir ? (occ, dir) => onMoveDir(occ, b.key, dir) : undefined
                }
                canMoveLeft={canLeft}
                canMoveRight={canRight}
                onOpenDetail={onOpenDetail}
                onMutate={onMutate}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
