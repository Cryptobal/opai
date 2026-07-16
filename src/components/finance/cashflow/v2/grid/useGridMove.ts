"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import type { ProjectionBucket } from "@/modules/finance/cashflow/types";
import type { PillVariant } from "@/components/finance/cashflow/CellStatusPill";
import type { UndoPayload } from "../UndoToast";
import { toDate } from "../format";
import { moveViaApi } from "./cashflow-move";

/** Datos que viajan con el chip arrastrado (dnd-kit `data`). Traen todo lo
 *  necesario para el move unificado y para pintar el overlay de arrastre. */
export interface GridDragData {
  kind: "grid-chip";
  itemId: string | null;
  itemName: string;
  occurrenceId: string | null;
  dteId: string | null;
  /** Fecha actual de la cuota (yyyy-MM-dd) — identifica la occurrence al mover. */
  originalDate: string;
  fromBucketKey: string;
  amount: number;
  variant: PillVariant;
  locked: boolean;
}

const ymd = (d: string | Date) => toDate(d).toISOString().slice(0, 10);

/**
 * Orquesta el move desde la grilla: API unificada, toasts, reconciliación
 * selectiva (`refreshWeeks` de origen+destino) y undo de 5s. El optimista vive
 * en la cola de `useCashflowMutations` (beginMove / clearPending por id).
 */
export function useGridMove(opts: {
  buckets: ProjectionBucket[];
  refreshWeeks: (keys: string[]) => Promise<void>;
  /** Push move optimista; retorna id de la entrada en la cola. */
  onOptimistic?: (
    itemId: string,
    fromBucketKey: string,
    toBucketKey: string,
  ) => string;
  /** Remueve SOLO ese pending por id (tras settle o error). */
  clearOptimistic?: (id: string) => void;
  /** Registra el undo de 5s (cola compartida con hide). */
  pushUndo: (payload: UndoPayload) => void;
}) {
  const { buckets, refreshWeeks, onOptimistic, clearOptimistic, pushUndo } =
    opts;
  const [submitting, setSubmitting] = useState(false);

  const move = useCallback(
    async (drag: GridDragData, toBucketKey: string) => {
      const to = buckets.find((b) => b.key === toBucketKey);
      const from = buckets.find((b) => b.key === drag.fromBucketKey);
      if (!to || !from || to.key === from.key) return;

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
      });
      setSubmitting(false);

      const keys = [from.key, to.key];
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
      await refreshWeeks(keys);
      if (pendingId) clearOptimistic?.(pendingId);

      pushUndo({
        occurrenceName: drag.itemName,
        destLabel: to.label,
        undo: async () => {
          await moveViaApi({
            occurrenceId: drag.occurrenceId,
            itemId: drag.itemId,
            dteId: drag.dteId,
            originalDate: ymd(to.start),
            newDate: ymd(from.start),
          });
          await refreshWeeks(keys);
        },
      });
    },
    [buckets, refreshWeeks, onOptimistic, clearOptimistic, pushUndo],
  );

  const moveGroup = useCallback(
    async (opts: {
      occurrenceIds: string[];
      label: string;
      fromBucketKey: string;
      toBucketKey: string;
      skippedPaid?: number;
    }) => {
      const to = buckets.find((b) => b.key === opts.toBucketKey);
      const from = buckets.find((b) => b.key === opts.fromBucketKey);
      if (!to || !from || to.key === from.key || opts.occurrenceIds.length === 0) {
        return;
      }

      const newDate = ymd(to.start);
      const keys = [from.key, to.key];
      setSubmitting(true);
      const results = await Promise.all(
        opts.occurrenceIds.map((id) =>
          moveViaApi({
            occurrenceId: id,
            itemId: null,
            dteId: null,
            originalDate: ymd(from.start),
            newDate,
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
        opts.skippedPaid && opts.skippedPaid > 0
          ? ` · ${opts.skippedPaid} pagada${opts.skippedPaid > 1 ? "s" : ""} no se movieron`
          : "";
      toast.success(`${opts.label} movido a ${to.label}${skipped}`);
      if (failed > 0) {
        toast.warning(`${failed} cuota${failed > 1 ? "s" : ""} no se pudieron mover`);
      }
      await refreshWeeks(keys);

      pushUndo({
        occurrenceName: opts.label,
        destLabel: to.label,
        undo: async () => {
          await Promise.all(
            opts.occurrenceIds.map((id) =>
              moveViaApi({
                occurrenceId: id,
                itemId: null,
                dteId: null,
                originalDate: newDate,
                newDate: ymd(from.start),
              }),
            ),
          );
          await refreshWeeks(keys);
        },
      });
    },
    [buckets, refreshWeeks, pushUndo],
  );

  return { move, moveGroup, submitting };
}
