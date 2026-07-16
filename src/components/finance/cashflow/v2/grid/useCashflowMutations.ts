"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import type { ProjectionRow } from "@/modules/finance/cashflow/types";
import type { UndoPayload } from "../UndoToast";
import type { HiddenFromFlowPayload } from "./CellFlowActions";
import {
  applyAllPending,
  newPendingId,
  removePendingById,
  type PendingEntry,
} from "./optimistic-move";

/**
 * Cola de mutaciones optimistas de la grilla FC (F1).
 *
 * Ciclo: push pending (UI a 0 ms) → API (amount/hide ya en el cell; move en
 * useGridMove) → refreshWeeks(keys) → remove SOLO ese pending por id.
 * Nunca clearOptimistic global: dos edits conviven sin pisarse.
 */
export function useCashflowMutations(opts: {
  refreshWeeks: (keys: string[]) => Promise<void>;
}) {
  const { refreshWeeks } = opts;
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
    async (id: string, keys: string[]) => {
      if (keys.length > 0) await refreshWeeks(keys);
      remove(id);
    },
    [refreshWeeks, remove],
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
    }) => {
      if (!patch?.bucketKey) return;
      if (patch.itemId && patch.amount != null) {
        const id = push({
          kind: "amount",
          itemId: patch.itemId,
          bucketKey: patch.bucketKey,
          amount: patch.amount,
        });
        await settle(id, [patch.bucketKey]);
        return;
      }
      await refreshWeeks([patch.bucketKey]);
    },
    [push, settle, refreshWeeks],
  );

  /** Tras create inline: pinta la celda y reconcilia la semana. */
  const handleCreated = useCallback(
    async (patch: { itemId: string; bucketKey: string; amount: number }) => {
      const id = push({
        kind: "create",
        itemId: patch.itemId,
        bucketKey: patch.bucketKey,
        amount: patch.amount,
      });
      await settle(id, [patch.bucketKey]);
    },
    [push, settle],
  );

  const handleHiddenFromFlow = useCallback(
    async (undo: HiddenFromFlowPayload) => {
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
      if (id) await settle(id, [undo.bucketKey]);
      else await refreshWeeks([undo.bucketKey]);

      pushUndo({
        occurrenceName: undo.label,
        destLabel: "ocultado del flujo",
        undo: async () => {
          const res = await restoreToFlowViaApi({
            dteId: undo.dteId,
            occurrenceId: undo.occurrenceId,
          });
          if (!res.ok) {
            toast.error(res.error ?? "No se pudo deshacer");
            return;
          }
          toast.success("Restaurado al flujo");
          await refreshWeeks([undo.bucketKey]);
        },
      });
    },
    [push, settle, refreshWeeks, pushUndo],
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
