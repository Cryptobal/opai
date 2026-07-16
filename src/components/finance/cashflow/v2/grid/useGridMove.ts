"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import type {
  ProjectionBucket,
  ProjectionMatrix,
} from "@/modules/finance/cashflow/types";
import type { PillVariant } from "@/components/finance/cashflow/CellStatusPill";
import type { UndoPayload } from "../UndoToast";
import { toDate } from "../format";
import { moveViaApi } from "./cashflow-move";
import { rangeFromBucketKeys } from "./return-range-client";

export interface GridDragData {
  kind: "grid-chip";
  itemId: string | null;
  itemName: string;
  occurrenceId: string | null;
  dteId: string | null;
  originalDate: string;
  fromBucketKey: string;
  amount: number;
  variant: PillVariant;
  locked: boolean;
}

const ymd = (d: string | Date) => toDate(d).toISOString().slice(0, 10);

/**
 * Move desde la grilla. F4: pide returnRange y parchea si viene projection;
 * si no, fallback refreshWeeks.
 */
export function useGridMove(opts: {
  buckets: ProjectionBucket[];
  refreshWeeks: (keys: string[]) => Promise<void>;
  patchMatrix?: (incoming: ProjectionMatrix) => void;
  onOptimistic?: (
    itemId: string,
    fromBucketKey: string,
    toBucketKey: string,
  ) => string;
  clearOptimistic?: (id: string) => void;
  pushUndo: (payload: UndoPayload) => void;
}) {
  const {
    buckets,
    refreshWeeks,
    patchMatrix,
    onOptimistic,
    clearOptimistic,
    pushUndo,
  } = opts;
  const [submitting, setSubmitting] = useState(false);

  const reconcile = useCallback(
    async (keys: string[], projection?: ProjectionMatrix) => {
      if (projection && patchMatrix) patchMatrix(projection);
      else await refreshWeeks(keys);
    },
    [patchMatrix, refreshWeeks],
  );

  const move = useCallback(
    async (drag: GridDragData, toBucketKey: string) => {
      const to = buckets.find((b) => b.key === toBucketKey);
      const from = buckets.find((b) => b.key === drag.fromBucketKey);
      if (!to || !from || to.key === from.key) return;

      let pendingId: string | undefined;
      if (drag.itemId) {
        pendingId = onOptimistic?.(drag.itemId, from.key, to.key);
      }

      const keys = [from.key, to.key];
      const returnRange = rangeFromBucketKeys(keys);
      setSubmitting(true);
      const result = await moveViaApi({
        occurrenceId: drag.occurrenceId,
        itemId: drag.itemId,
        dteId: drag.dteId,
        originalDate: drag.originalDate,
        newDate: ymd(to.start),
        returnRange,
      });
      setSubmitting(false);

      if (!result.ok) {
        if (pendingId) clearOptimistic?.(pendingId);
        const msg = result.error ?? "No se pudo mover";
        toast.error(msg, {
          duration: msg.toLowerCase().includes("cerrada") ? 6000 : 4000,
        });
        return;
      }
      toast.success(`Movido a ${to.label}`);
      if (result.overwrote) {
        toast.info(
          `Sobrescribió la proyección de ${result.overwrote.itemName} en ${to.label}`,
          { duration: 4000 },
        );
      }
      await reconcile(keys, result.projection);
      if (pendingId) clearOptimistic?.(pendingId);

      pushUndo({
        occurrenceName: drag.itemName,
        destLabel: to.label,
        undo: async () => {
          const undoRes = await moveViaApi({
            occurrenceId: drag.occurrenceId,
            itemId: drag.itemId,
            dteId: drag.dteId,
            originalDate: ymd(to.start),
            newDate: ymd(from.start),
            returnRange,
          });
          await reconcile(keys, undoRes.ok ? undoRes.projection : undefined);
        },
      });
    },
    [buckets, reconcile, onOptimistic, clearOptimistic, pushUndo],
  );

  const moveGroup = useCallback(
    async (groupOpts: {
      occurrenceIds: string[];
      label: string;
      fromBucketKey: string;
      toBucketKey: string;
      skippedPaid?: number;
    }) => {
      const to = buckets.find((b) => b.key === groupOpts.toBucketKey);
      const from = buckets.find((b) => b.key === groupOpts.fromBucketKey);
      if (
        !to ||
        !from ||
        to.key === from.key ||
        groupOpts.occurrenceIds.length === 0
      ) {
        return;
      }

      const newDate = ymd(to.start);
      const keys = [from.key, to.key];
      const returnRange = rangeFromBucketKeys(keys);
      setSubmitting(true);
      // Solo el último pide proyección (evitar N buildProjection).
      const results = await Promise.all(
        groupOpts.occurrenceIds.map((id, i) =>
          moveViaApi({
            occurrenceId: id,
            itemId: null,
            dteId: null,
            originalDate: ymd(from.start),
            newDate,
            returnRange:
              i === groupOpts.occurrenceIds.length - 1
                ? returnRange
                : undefined,
          }),
        ),
      );
      setSubmitting(false);

      const failed = results.filter((r) => !r.ok).length;
      const moved = results.length - failed;
      if (moved === 0) {
        toast.error("No se pudieron mover los egresos");
        return;
      }
      const skipped =
        groupOpts.skippedPaid && groupOpts.skippedPaid > 0
          ? ` · ${groupOpts.skippedPaid} pagada${groupOpts.skippedPaid > 1 ? "s" : ""} no se movieron`
          : "";
      toast.success(`${groupOpts.label} movido a ${to.label}${skipped}`);
      if (failed > 0) {
        toast.warning(
          `${failed} cuota${failed > 1 ? "s" : ""} no se pudieron mover`,
        );
      }
      const projection = results.find(
        (r): r is Extract<typeof r, { ok: true }> => r.ok && !!r.projection,
      )?.projection;
      await reconcile(keys, projection);

      pushUndo({
        occurrenceName: groupOpts.label,
        destLabel: to.label,
        undo: async () => {
          const undoResults = await Promise.all(
            groupOpts.occurrenceIds.map((id, i) =>
              moveViaApi({
                occurrenceId: id,
                itemId: null,
                dteId: null,
                originalDate: newDate,
                newDate: ymd(from.start),
                returnRange:
                  i === groupOpts.occurrenceIds.length - 1
                    ? returnRange
                    : undefined,
              }),
            ),
          );
          const undoProj = undoResults.find(
            (r): r is Extract<typeof r, { ok: true }> =>
              r.ok && !!r.projection,
          )?.projection;
          await reconcile(keys, undoProj);
        },
      });
    },
    [buckets, reconcile, pushUndo],
  );

  return { move, moveGroup, submitting };
}
