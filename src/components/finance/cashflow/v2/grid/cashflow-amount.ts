/**
 * Guardado/reverso del monto de una celda. Encapsula
 * `POST /api/finance/cashflow/occurrences/[id]/amount`.
 */

import type { ProjectionMatrix } from "@/modules/finance/cashflow/types";
import type { ClientReturnRange } from "./return-range-client";

export interface AmountResult {
  ok: boolean;
  error?: string;
  projection?: ProjectionMatrix;
}

async function patchAmount(
  occurrenceId: string,
  amountClp: number | null,
  returnRange?: ClientReturnRange,
): Promise<AmountResult> {
  try {
    const res = await fetch(
      `/api/finance/cashflow/occurrences/${occurrenceId}/amount`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountClp,
          ...(returnRange ? { returnRange } : {}),
        }),
      },
    );
    const j = await res.json().catch(() => null);
    if (j?.success) {
      return { ok: true, projection: j?.data?.projection };
    }
    return { ok: false, error: j?.error ?? "No se pudo guardar el monto" };
  } catch {
    return { ok: false, error: "Error de red al guardar el monto" };
  }
}

/** Fija (o limpia, con null) el monto de una occurrence individual. */
export function saveOccurrenceAmount(
  occurrenceId: string,
  amountClp: number | null,
  returnRange?: ClientReturnRange,
): Promise<AmountResult> {
  return patchAmount(occurrenceId, amountClp, returnRange);
}

export function distributeGroupAmount(
  occurrences: { id: string; amountClp: number }[],
  newTotal: number,
): { id: string; amountClp: number }[] {
  const n = occurrences.length;
  if (n === 0 || newTotal <= 0) return [];
  const currentTotal = occurrences.reduce((s, o) => s + o.amountClp, 0);
  let parts: { id: string; amountClp: number }[];
  if (currentTotal <= 0) {
    const each = Math.max(1, Math.floor(newTotal / n));
    parts = occurrences.map((o) => ({ id: o.id, amountClp: each }));
  } else {
    parts = occurrences.map((o) => ({
      id: o.id,
      amountClp: Math.max(1, Math.round((o.amountClp * newTotal) / currentTotal)),
    }));
  }
  const sum = parts.reduce((s, p) => s + p.amountClp, 0);
  const diff = newTotal - sum;
  if (diff !== 0) {
    let idx = 0;
    for (let i = 1; i < parts.length; i++) {
      if (parts[i].amountClp > parts[idx].amountClp) idx = i;
    }
    parts[idx].amountClp = Math.max(1, parts[idx].amountClp + diff);
  }
  return parts;
}

/**
 * Edita el total de un grupo. N POSTs en paralelo; solo el ÚLTIMO pide
 * `returnRange` para no ejecutar buildProjection N veces (F4).
 */
export async function saveGroupAmount(
  occurrences: { id: string; amountClp: number }[],
  newTotal: number,
  returnRange?: ClientReturnRange,
): Promise<AmountResult> {
  const parts = distributeGroupAmount(occurrences, newTotal);
  if (parts.length === 0) return { ok: false, error: "Grupo sin cuotas editables" };
  const results = await Promise.all(
    parts.map((p, i) =>
      patchAmount(
        p.id,
        p.amountClp,
        i === parts.length - 1 ? returnRange : undefined,
      ),
    ),
  );
  const failed = results.filter((r) => !r.ok);
  const projection = results.find((r) => r.projection)?.projection;
  if (failed.length === parts.length) {
    return { ok: false, error: failed[0].error ?? "No se pudo guardar" };
  }
  if (failed.length > 0) {
    return {
      ok: true,
      error: `${failed.length} cuota(s) no se guardaron`,
      projection,
    };
  }
  return { ok: true, projection };
}

export async function revertAmount(
  occurrenceIds: string[],
  returnRange?: ClientReturnRange,
): Promise<AmountResult> {
  if (occurrenceIds.length === 0) return { ok: false, error: "Sin cuotas" };
  // Solo el último pide proyección (mismo criterio que saveGroupAmount).
  const results = await Promise.all(
    occurrenceIds.map((id, i) =>
      patchAmount(
        id,
        null,
        i === occurrenceIds.length - 1 ? returnRange : undefined,
      ),
    ),
  );
  const failed = results.filter((r) => !r.ok);
  const projection = results.find((r) => r.projection)?.projection;
  if (failed.length === occurrenceIds.length) {
    return { ok: false, error: failed[0].error ?? "No se pudo revertir" };
  }
  return { ok: true, projection };
}
