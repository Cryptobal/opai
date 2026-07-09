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
 * Orquesta el move desde la grilla: llama al endpoint unificado, muestra
 * toasts (éxito / colisión 409 / semana cerrada), refresca el bloque visible y
 * arma el undo de 5s (que revierte moviendo la cuota de vuelta a su semana).
 */
export function useGridMove(opts: {
  buckets: ProjectionBucket[];
  refresh: () => void | Promise<void>;
}) {
  const { buckets, refresh } = opts;
  const [submitting, setSubmitting] = useState(false);
  const [undoPayload, setUndoPayload] = useState<UndoPayload | null>(null);

  const move = useCallback(
    async (drag: GridDragData, toBucketKey: string) => {
      const to = buckets.find((b) => b.key === toBucketKey);
      const from = buckets.find((b) => b.key === drag.fromBucketKey);
      if (!to || !from || to.key === from.key) return;

      setSubmitting(true);
      const result = await moveViaApi({
        occurrenceId: drag.occurrenceId,
        itemId: drag.itemId,
        dteId: drag.dteId,
        originalDate: drag.originalDate,
        newDate: ymd(to.start),
      });
      setSubmitting(false);

      if (!result.ok) {
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
      await refresh();

      // Undo: mueve la cuota de vuelta a su semana original. Tras el move la
      // cuota vive en `to`, así que el reverse parte de ahí.
      setUndoPayload({
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
          await refresh();
        },
      });
    },
    [buckets, refresh],
  );

  return {
    move,
    submitting,
    undoPayload,
    clearUndo: useCallback(() => setUndoPayload(null), []),
  };
}
