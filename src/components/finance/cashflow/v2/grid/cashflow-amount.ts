/**
 * Guardado/reverso del monto de una celda (B4B). Encapsula el endpoint
 * `POST /api/finance/cashflow/occurrences/[id]/amount` (override manual) para:
 *  - una occurrence individual (IVA, factura de venta, etc.), y
 *  - una celda de grupo (sueldos/previred/turnos): el usuario edita el TOTAL de
 *    la semana y se reparte proporcional entre las N instalaciones, así el
 *    subtotal y la fila FC cuadran sin schema nuevo.
 * `amountClp: null` limpia el override y restaura el monto calculado.
 */

export interface AmountResult {
  ok: boolean;
  error?: string;
}

async function patchAmount(
  occurrenceId: string,
  amountClp: number | null,
): Promise<AmountResult> {
  try {
    const res = await fetch(
      `/api/finance/cashflow/occurrences/${occurrenceId}/amount`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountClp }),
      },
    );
    const j = await res.json().catch(() => null);
    if (j?.success) return { ok: true };
    return { ok: false, error: j?.error ?? "No se pudo guardar el monto" };
  } catch {
    return { ok: false, error: "Error de red al guardar el monto" };
  }
}

/** Fija (o limpia, con null) el monto de una occurrence individual. */
export function saveOccurrenceAmount(
  occurrenceId: string,
  amountClp: number | null,
): Promise<AmountResult> {
  return patchAmount(occurrenceId, amountClp);
}

/**
 * Reparte `newTotal` proporcional a los montos actuales de las occurrences del
 * grupo. Redondea a peso y ajusta el resto en la occurrence de mayor monto para
 * que la suma sea exactamente `newTotal`. Cada parte queda ≥ 1 (el endpoint
 * exige monto positivo). Si el total actual es 0, reparte en partes iguales.
 */
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
  // Ajuste del resto de redondeo en la parte más grande.
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

/** Edita el total de una celda de grupo repartiéndolo entre sus occurrences. */
export async function saveGroupAmount(
  occurrences: { id: string; amountClp: number }[],
  newTotal: number,
): Promise<AmountResult> {
  const parts = distributeGroupAmount(occurrences, newTotal);
  if (parts.length === 0) return { ok: false, error: "Grupo sin cuotas editables" };
  const results = await Promise.all(
    parts.map((p) => patchAmount(p.id, p.amountClp)),
  );
  const failed = results.filter((r) => !r.ok);
  if (failed.length === parts.length) {
    return { ok: false, error: failed[0].error ?? "No se pudo guardar" };
  }
  if (failed.length > 0) {
    return { ok: true, error: `${failed.length} cuota(s) no se guardaron` };
  }
  return { ok: true };
}

/** Revierte el override de todas las occurrences pasadas (restaura calculado). */
export async function revertAmount(
  occurrenceIds: string[],
): Promise<AmountResult> {
  if (occurrenceIds.length === 0) return { ok: false, error: "Sin cuotas" };
  const results = await Promise.all(
    occurrenceIds.map((id) => patchAmount(id, null)),
  );
  const failed = results.filter((r) => !r.ok);
  if (failed.length === occurrenceIds.length) {
    return { ok: false, error: failed[0].error ?? "No se pudo revertir" };
  }
  return { ok: true };
}
