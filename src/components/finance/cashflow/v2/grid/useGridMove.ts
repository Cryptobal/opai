"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type {
  ProjectionBucket,
  ProjectionMatrix,
} from "@/modules/finance/cashflow/types";
import type { PillVariant } from "@/components/finance/cashflow/CellStatusPill";
import type { UndoPayload } from "../UndoToast";
import { toDate } from "../format";
import { moveViaApi, type MoveConflict } from "./cashflow-move";
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

/** "2026-07-23" → "23 jul". Para destinos que no son el lunes del bucket. */
export const dayLabel = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return format(new Date(y, m - 1, d), "d MMM", { locale: es });
};

/** Reintenta el move con la estrategia elegida por el usuario en el modal. */
export type MoveConflictRetry = (
  strategy: "replace" | "next_free",
) => Promise<void>;

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
  /**
   * El backend devolvió 409: hay que preguntarle al usuario cómo resolver.
   * `retry` re-lanza el mismo move con la estrategia elegida.
   */
  onConflict?: (conflict: MoveConflict, retry: MoveConflictRetry) => void;
}) {
  const {
    buckets,
    refreshWeeks,
    patchMatrix,
    onOptimistic,
    clearOptimistic,
    pushUndo,
    onConflict,
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

      const keys = [from.key, to.key];
      const returnRange = rangeFromBucketKeys(keys);

      /**
       * Un intento de move. Si el backend responde 409, delega en el modal y
       * se vuelve a llamar con la estrategia elegida. `finalDate` es la fecha
       * real en la que queda la cuota cuando la estrategia la corre
       * (next_free): el undo y el label deben apuntar ahí, no al bucket.
       */
      const attempt = async (
        resolveStrategy?: "replace" | "next_free",
        finalDate?: string,
      ): Promise<void> => {
        let pendingId: string | undefined;
        if (drag.itemId) {
          pendingId = onOptimistic?.(drag.itemId, from.key, to.key);
        }

        setSubmitting(true);
        const result = await moveViaApi({
          occurrenceId: drag.occurrenceId,
          itemId: drag.itemId,
          dteId: drag.dteId,
          originalDate: drag.originalDate,
          newDate: ymd(to.start),
          returnRange,
          ...(resolveStrategy ? { resolveStrategy } : {}),
        });
        setSubmitting(false);

        if (!result.ok) {
          if (pendingId) clearOptimistic?.(pendingId);
          // Colisión resoluble: la decide el usuario en el modal, no un toast.
          if (result.conflict && onConflict) {
            const c = result.conflict;
            onConflict(c, (strategy) =>
              attempt(
                strategy,
                strategy === "next_free" ? c.suggestedFreeDate : undefined,
              ),
            );
            return;
          }
          // Resto de errores (semana cerrada, conciliada, red): toast rojo.
          const msg = result.error ?? "No se pudo mover";
          toast.error(msg, {
            duration: msg.toLowerCase().includes("cerrada") ? 6000 : 4000,
          });
          return;
        }

        const destLabel = finalDate ? dayLabel(finalDate) : to.label;
        toast.success(`Movido a ${destLabel}`);
        if (result.clearedCancelled) {
          toast.info("Se limpió una cuota eliminada que ocupaba esa fecha", {
            duration: 4000,
          });
        }
        if (result.overwrote) {
          toast.info(
            `Sobrescribió la proyección de ${result.overwrote.itemName} en ${destLabel}`,
            { duration: 4000 },
          );
        }
        await reconcile(keys, result.projection);
        if (pendingId) clearOptimistic?.(pendingId);

        pushUndo({
          occurrenceName: drag.itemName,
          destLabel,
          undo: async () => {
            const undoRes = await moveViaApi({
              occurrenceId: drag.occurrenceId,
              itemId: drag.itemId,
              dteId: drag.dteId,
              originalDate: finalDate ?? ymd(to.start),
              newDate: ymd(from.start),
              returnRange,
            });
            await reconcile(keys, undoRes.ok ? undoRes.projection : undefined);
          },
        });
      };

      await attempt();
    },
    [buckets, reconcile, onOptimistic, clearOptimistic, pushUndo, onConflict],
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
