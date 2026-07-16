/**
 * Move unificado de una cuota entre semanas. Encapsula los 3 caminos que ya
 * existían dispersos (occurrence materializada / occurrence virtual desde su
 * item / DTE huérfano) detrás de un solo llamado.
 */

import type { ProjectionMatrix } from "@/modules/finance/cashflow/types";
import type { ClientReturnRange } from "./return-range-client";

export type MoveConflict = {
  existingOccurrenceId: string;
  targetDate: string;
  suggestedFreeDate: string;
  reason: "same_level" | "target_is_stronger";
};

export type MoveResult =
  | {
      ok: true;
      overwrote?: { occurrenceId: string; itemName: string } | null;
      /** Se limpió una cuota eliminada (lápida CANCELLED) que ocupaba el destino. */
      clearedCancelled?: boolean;
      projection?: ProjectionMatrix;
    }
  | { ok: false; conflict?: MoveConflict; error?: string; status?: number };

export interface MoveInput {
  occurrenceId: string | null;
  itemId: string | null;
  dteId: string | null;
  /** Fecha actual de la cuota (yyyy-MM-dd). */
  originalDate: string;
  /** Lunes de la semana destino (yyyy-MM-dd). */
  newDate: string;
  /** F4: pedir proyección parcial del rango afectado. */
  returnRange?: ClientReturnRange;
}

function isSyntheticItemId(id: string | null): boolean {
  return (
    !!id &&
    (id.startsWith("_dte:") ||
      id.startsWith("_orphan") ||
      id.startsWith("_periodic") ||
      id.startsWith("_extra:") ||
      id.startsWith("_conc:") ||
      id.startsWith("_group:"))
  );
}

export function unwrapProgItemId(id: string | null): string | null {
  if (!id || !id.startsWith("_prog:")) return null;
  return id.slice("_prog:".length).split(":")[0] || null;
}

export async function moveViaApi(input: MoveInput): Promise<MoveResult> {
  const { occurrenceId, dteId, originalDate, newDate, returnRange } = input;
  const itemId =
    unwrapProgItemId(input.itemId) ??
    (isSyntheticItemId(input.itemId) ? null : input.itemId);
  let res: Response;
  try {
    if (occurrenceId) {
      res = await fetch(
        `/api/finance/cashflow/occurrences/${occurrenceId}/move`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newDate, ...(returnRange ? { returnRange } : {}) }),
        },
      );
    } else if (dteId) {
      res = await fetch(`/api/finance/cashflow/dtes/${dteId}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newDate, ...(returnRange ? { returnRange } : {}) }),
      });
    } else if (itemId) {
      res = await fetch(`/api/finance/cashflow/occurrences/upsert-and-act`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "move",
          itemId,
          originalDate,
          newDate,
          ...(returnRange ? { returnRange } : {}),
        }),
      });
    } else {
      return { ok: false, error: "Esta cuota no se puede mover" };
    }
  } catch {
    return { ok: false, error: "Error de red al mover" };
  }

  const j = await res.json().catch(() => null);
  if (j?.success) {
    return {
      ok: true,
      overwrote: j.overwrote ?? null,
      clearedCancelled: j.clearedCancelled ?? false,
      projection: j?.data?.projection,
    };
  }
  if (res.status === 409 && j?.conflict) {
    return {
      ok: false,
      conflict: j.conflict as MoveConflict,
      error: j?.error,
      status: 409,
    };
  }
  return { ok: false, error: j?.error ?? "No se pudo mover", status: res.status };
}
