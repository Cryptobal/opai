/**
 * Move unificado de una cuota entre semanas. Encapsula los 3 caminos que ya
 * existían dispersos (occurrence materializada / occurrence virtual desde su
 * item / DTE huérfano) detrás de un solo llamado, para que la grilla exponga
 * un único gesto de arrastre. Es la misma lógica de `performMove` de
 * `CashflowV2Shell`, extraída a una función pura (sin estado de React) para
 * reutilizarla sin duplicarla.
 *
 * Router de endpoint según los identificadores disponibles:
 *  - occurrenceId → POST occurrences/[id]/move
 *  - itemId       → POST occurrences/upsert-and-act (materializa al mover;
 *                   manda dteId para que la cuota quede "fuerte")
 *  - dteId        → POST dtes/[dteId]/move (override de fecha de visibilidad)
 */

export type MoveConflict = {
  existingOccurrenceId: string;
  targetDate: string;
  suggestedFreeDate: string;
  reason: "same_level" | "target_is_stronger";
};

export type MoveResult =
  | { ok: true; overwrote?: { occurrenceId: string; itemName: string } | null }
  | { ok: false; conflict?: MoveConflict; error?: string; status?: number };

export interface MoveInput {
  occurrenceId: string | null;
  itemId: string | null;
  dteId: string | null;
  /** Fecha actual de la cuota (yyyy-MM-dd). */
  originalDate: string;
  /** Lunes de la semana destino (yyyy-MM-dd). */
  newDate: string;
}

/** itemId sintético que produce buildRows para filas sin FinanceCashflowItem real
 *  (`_dte:<uuid>`, `_orphan`, `_periodic:<source>`). No es un UUID: no debe ir a
 *  la rama `itemId` del router (Zod exige uuid → 400 "Invalid UUID"). */
function isSyntheticItemId(id: string | null): boolean {
  return !!id && (id.startsWith("_dte:") || id.startsWith("_orphan") || id.startsWith("_periodic"));
}

export async function moveViaApi(input: MoveInput): Promise<MoveResult> {
  const { occurrenceId, dteId, originalDate, newDate } = input;
  // Un itemId sintético (fila huérfana `_dte:`, `_orphan`, `_periodic`) NO es un
  // UUID real: lo anulamos para que el router caiga a la rama dteId (DTE huérfano →
  // dtes/[dteId]/move) en vez de mandar basura a upsert-and-act.
  const itemId = isSyntheticItemId(input.itemId) ? null : input.itemId;
  let res: Response;
  try {
    if (occurrenceId) {
      res = await fetch(
        `/api/finance/cashflow/occurrences/${occurrenceId}/move`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newDate }),
        },
      );
    } else if (itemId) {
      res = await fetch(`/api/finance/cashflow/occurrences/upsert-and-act`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "move",
          itemId,
          originalDate,
          newDate,
          dteId: dteId ?? undefined,
        }),
      });
    } else if (dteId) {
      res = await fetch(`/api/finance/cashflow/dtes/${dteId}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newDate }),
      });
    } else {
      return { ok: false, error: "Esta cuota no se puede mover" };
    }
  } catch {
    return { ok: false, error: "Error de red al mover" };
  }

  const j = await res.json().catch(() => null);
  if (j?.success) return { ok: true, overwrote: j.overwrote ?? null };
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
