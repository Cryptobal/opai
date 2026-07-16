"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import type {
  ProjectionMatrix,
  ProjectionRow,
} from "@/modules/finance/cashflow/types";
import type { UndoPayload } from "../UndoToast";
import type { HiddenFromFlowPayload } from "./CellFlowActions";
import {
  applyAllPending,
  newPendingId,
  removePendingById,
  type PendingEntry,
} from "./optimistic-move";
import { rangeFromBucketKeys } from "./return-range-client";

/**
 * Cola de mutaciones optimistas (F1) + settle con parche F4.
 * Con `projection` → patchMatrix (0 fetch). Sin ella → refreshWeeks (fallback).
 */
export function useCashflowMutations(opts: {
  refreshWeeks: (keys: string[]) => Promise<void>;
  patchMatrix?: (incoming: ProjectionMatrix) => void;
}) {
  const { refreshWeeks, patchMatrix } = opts;
  const [pending, setPending] = useState<PendingEntry[]>([]);
  const [undoPayload, setUndoPayload] = useState<UndoPayload | null>(null);

  const pushUndo = useCallback((payload: UndoPayload) => {
    setUndoPayload(payload);
  }, []);
  const clearUndo = useCallback(() => setUndoPayload(null), []);

  const push = useCallback(
    (
      entry:
        | { kind: "move"; itemId: string; fromBucketKey: string; toBucketKey: string }
        | { kind: "hide"; itemId: string; bucketKey: string }
        | { kind: "amount"; itemId: string; bucketKey: string; amount: number }
        | { kind: "create"; itemId: string; bucketKey: string; amount: number },
    ): string => {
      const id = newPendingId();
      setPending((p) => [...p, { ...entry, id }]);
      return id;
    },
    [],
  );

  const remove = useCallback((id: string) => {
    setPending((p) => removePendingById(p, id));
  }, []);

  const settle = useCallback(
    async (
      id: string,
      keys: string[],
      projection?: ProjectionMatrix,
    ) => {
      if (projection && patchMatrix) {
        patchMatrix(projection);
      } else if (keys.length > 0) {
        await refreshWeeks(keys);
      }
      remove(id);
    },
    [refreshWeeks, patchMatrix, remove],
  );

  const displayRowsOf = useCallback(
    (rows: ProjectionRow[]) => applyAllPending(rows, pending),
    [pending],
  );

  const beginMove = useCallback(
    (itemId: string, fromBucketKey: string, toBucketKey: string) =>
      push({ kind: "move", itemId, fromBucketKey, toBucketKey }),
    [push],
  );

  const handleAmountSaved = useCallback(
    async (patch?: {
      itemId: string;
      bucketKey: string;
      amount?: number;
      projection?: ProjectionMatrix;
    }) => {
      if (!patch?.bucketKey) return;
      if (patch.itemId && patch.amount != null) {
        const id = push({
          kind: "amount",
          itemId: patch.itemId,
          bucketKey: patch.bucketKey,
          amount: patch.amount,
        });
        await settle(id, [patch.bucketKey], patch.projection);
        return;
      }
      if (patch.projection && patchMatrix) {
        patchMatrix(patch.projection);
        return;
      }
      await refreshWeeks([patch.bucketKey]);
    },
    [push, settle, refreshWeeks, patchMatrix],
  );

  const handleCreated = useCallback(
    async (patch: {
      itemId: string;
      bucketKey: string;
      amount: number;
      projection?: ProjectionMatrix;
    }) => {
      const id = push({
        kind: "create",
        itemId: patch.itemId,
        bucketKey: patch.bucketKey,
        amount: patch.amount,
      });
      await settle(id, [patch.bucketKey], patch.projection);
    },
    [push, settle],
  );

  const handleHiddenFromFlow = useCallback(
    async (
      undo: HiddenFromFlowPayload & { projection?: ProjectionMatrix },
    ) => {
      const { restoreToFlowViaApi } = await import("./cashflow-hide");
      let id: string | null = null;
      if (undo.itemId) {
        id = push({
          kind: "hide",
          itemId: undo.itemId,
          bucketKey: undo.bucketKey,
        });
      }
      toast.success(`«${undo.label}» ocultado del flujo`);
      if (id) await settle(id, [undo.bucketKey], undo.projection);
      else if (undo.projection && patchMatrix) patchMatrix(undo.projection);
      else await refreshWeeks([undo.bucketKey]);

      const range = rangeFromBucketKeys([undo.bucketKey]);
      pushUndo({
        occurrenceName: undo.label,
        destLabel: "ocultado del flujo",
        undo: async () => {
          const res = await restoreToFlowViaApi({
            dteId: undo.dteId,
            occurrenceId: undo.occurrenceId,
            returnRange: range,
          });
          if (!res.ok) {
            toast.error(res.error ?? "No se pudo deshacer");
            return;
          }
          toast.success("Restaurado al flujo");
          if (res.projection && patchMatrix) patchMatrix(res.projection);
          else await refreshWeeks([undo.bucketKey]);
        },
      });
    },
    [push, settle, refreshWeeks, pushUndo, patchMatrix],
  );

  return {
    displayRowsOf,
    beginMove,
    clearPending: remove,
    handleAmountSaved,
    handleCreated,
    handleHiddenFromFlow,
    undoPayload,
    clearUndo,
    pushUndo,
  };
}
