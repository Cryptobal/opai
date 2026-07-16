/**
 * Ocultar / restaurar una cuota en el flujo de caja.
 */

import type { ProjectionMatrix } from "@/modules/finance/cashflow/types";
import { unwrapProgItemId } from "./cashflow-move";
import type { ClientReturnRange } from "./return-range-client";

export type HideResult =
  | { ok: true; occurrenceId?: string | null; projection?: ProjectionMatrix }
  | { ok: false; error?: string };

export interface HideInput {
  dteId: string | null;
  occurrenceId: string | null;
  itemId: string | null;
  originalDate: string;
  label: string;
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

export async function hideFromFlowViaApi(input: HideInput): Promise<HideResult> {
  const { dteId, occurrenceId, originalDate, returnRange } = input;
  const itemId =
    unwrapProgItemId(input.itemId) ??
    (isSyntheticItemId(input.itemId) ? null : input.itemId);
  const rangeBody = returnRange ? { returnRange } : {};

  try {
    if (dteId) {
      const res = await fetch(
        `/api/finance/cashflow/dtes/${dteId}/exclude-flow`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ exclude: true, ...rangeBody }),
        },
      );
      const j = await res.json().catch(() => null);
      if (j?.success) return { ok: true, projection: j?.data?.projection };
      return { ok: false, error: j?.error ?? "No se pudo ocultar" };
    }

    if (occurrenceId) {
      const res = await fetch(
        `/api/finance/cashflow/occurrences/${occurrenceId}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "CANCELLED", ...rangeBody }),
        },
      );
      const j = await res.json().catch(() => null);
      if (j?.success) {
        return {
          ok: true,
          occurrenceId,
          projection: j?.data?.projection,
        };
      }
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
          ...rangeBody,
        }),
      });
      const j = await res.json().catch(() => null);
      if (j?.success) {
        return {
          ok: true,
          occurrenceId: j?.data?.id ?? null,
          projection: j?.data?.projection,
        };
      }
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
  returnRange?: ClientReturnRange;
}): Promise<HideResult> {
  const rangeBody = input.returnRange ? { returnRange: input.returnRange } : {};
  try {
    if (input.dteId) {
      const res = await fetch(
        `/api/finance/cashflow/dtes/${input.dteId}/exclude-flow`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ exclude: false, ...rangeBody }),
        },
      );
      const j = await res.json().catch(() => null);
      if (j?.success) return { ok: true, projection: j?.data?.projection };
      return { ok: false, error: j?.error ?? "No se pudo restaurar" };
    }

    if (input.occurrenceId) {
      const res = await fetch(
        `/api/finance/cashflow/occurrences/${input.occurrenceId}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "PROJECTED", ...rangeBody }),
        },
      );
      const j = await res.json().catch(() => null);
      if (j?.success) {
        return {
          ok: true,
          occurrenceId: input.occurrenceId,
          projection: j?.data?.projection,
        };
      }
      return { ok: false, error: j?.error ?? "No se pudo restaurar" };
    }

    return { ok: false, error: "No hay referencia para restaurar" };
  } catch {
    return { ok: false, error: "Error de red al restaurar" };
  }
}
