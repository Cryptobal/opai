"use client";

import { Lock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type {
  ProjectionMatrix,
  ProjectionAnchorInfo,
} from "@/modules/finance/cashflow/types";
import { fmtCLP } from "./format";
import { isBucketClosed } from "./projection-helpers";

interface Props {
  open: boolean;
  projection: ProjectionMatrix;
  anchor: ProjectionAnchorInfo | null;
  /** Bucket origen — se excluye de la lista de destinos. */
  excludeKey: string | null;
  onChoose: (key: string) => void;
  onClose: () => void;
}

/** Selector del bucket destino para mover una ocurrencia. */
export function MovePicker({
  open,
  projection,
  anchor,
  excludeKey,
  onChoose,
  onClose,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Mover a…</DialogTitle>
          <DialogDescription>
            Elegí la semana destino. Reprograma solo este movimiento.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-1 overflow-y-auto">
          {projection.buckets.map((b, i) => {
            if (b.key === excludeKey) return null;
            const projected = projection.cumulativePoints[i]?.projectedClp ?? 0;
            const closed = isBucketClosed(b, anchor);
            return (
              <button
                key={b.key}
                type="button"
                onClick={() => onChoose(b.key)}
                className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-ds-md border border-ds-border-default px-3 py-2 text-left hover:border-ds-border-strong hover:bg-ds-surface-2"
              >
                <span className="flex items-center gap-2 text-[13px] text-ds-text-1">
                  {closed && <Lock className="h-3 w-3 text-ds-text-3" />}
                  {b.label}
                </span>
                <span
                  className={cn(
                    "font-mono text-[12px] tabular-nums",
                    projected < 0 ? "text-status-danger-fg" : "text-ds-text-3",
                  )}
                >
                  {fmtCLP.format(projected)}
                </span>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
