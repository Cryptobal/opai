/**
 * Ocultar / restaurar una cuota en el flujo de caja.
 *
 * - Con dteId → exclude-flow (no toca Facturación/SII).
 * - Sin dteId → cancelar la occurrence (programación) / restaurar a PROJECTED.
 */

export type HideResult =
  | { ok: true; occurrenceId?: string | null }
  | { ok: false; error?: string };

export interface HideInput {
  dteId: string | null;
  occurrenceId: string | null;
  itemId: string | null;
  originalDate: string;
  /** Nombre para toasts / undo. */
  label: string;
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

export async function hideFromFlowViaApi(input: HideInput): Promise<HideResult> {
  const { dteId, occurrenceId, originalDate } = input;
  const itemId = isSyntheticItemId(input.itemId) ? null : input.itemId;

  try {
    if (dteId) {
      const res = await fetch(
        `/api/finance/cashflow/dtes/${dteId}/exclude-flow`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ exclude: true }),
        },
      );
      const j = await res.json().catch(() => null);
      if (j?.success) return { ok: true };
      return { ok: false, error: j?.error ?? "No se pudo ocultar" };
    }

    if (occurrenceId) {
      const res = await fetch(
        `/api/finance/cashflow/occurrences/${occurrenceId}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "CANCELLED" }),
        },
      );
      const j = await res.json().catch(() => null);
      if (j?.success) return { ok: true, occurrenceId };
      return { ok: false, error: j?.error ?? "No se pudo ocultar" };
    }

    if (itemId) {
      const res = await fetch(`/api/finance/cashflow/occurrences/upsert-and-act`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "cancel",
          itemId,
          originalDate,
        }),
      });
      const j = await res.json().catch(() => null);
      if (j?.success) return { ok: true, occurrenceId: j?.data?.id ?? null };
      return { ok: false, error: j?.error ?? "No se pudo ocultar" };
    }

    return { ok: false, error: "Esta cuota no se puede ocultar del flujo" };
  } catch {
    return { ok: false, error: "Error de red al ocultar" };
  }
}

export async function restoreToFlowViaApi(input: {
  dteId: string | null;
  occurrenceId: string | null;
}): Promise<HideResult> {
  try {
    if (input.dteId) {
      const res = await fetch(
        `/api/finance/cashflow/dtes/${input.dteId}/exclude-flow`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ exclude: false }),
        },
      );
      const j = await res.json().catch(() => null);
      if (j?.success) return { ok: true };
      return { ok: false, error: j?.error ?? "No se pudo restaurar" };
    }

    if (input.occurrenceId) {
      const res = await fetch(
        `/api/finance/cashflow/occurrences/${input.occurrenceId}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "PROJECTED" }),
        },
      );
      const j = await res.json().catch(() => null);
      if (j?.success) return { ok: true, occurrenceId: input.occurrenceId };
      return { ok: false, error: j?.error ?? "No se pudo restaurar" };
    }

    return { ok: false, error: "No hay referencia para restaurar" };
  } catch {
    return { ok: false, error: "Error de red al restaurar" };
  }
}
