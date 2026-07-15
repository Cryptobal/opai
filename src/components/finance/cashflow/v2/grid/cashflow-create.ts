/**
 * Alta manual de una cuota en el flujo de caja: crea un item MANUAL (ONCE) +
 * occurrence PROJECTED en la fecha elegida. Sirve para PROYECTAR un ingreso o
 * egreso a mano (ej. mientras la factura real no existe); queda como fila
 * propia, movible y borrable (ocultar del flujo). Cablea el `action: "create"`
 * de occurrences/upsert-and-act, que hasta ahora no tenía consumidor en la UI.
 */

export interface CreateManualInput {
  kind: "INCOME" | "EXPENSE";
  /** Concepto visible en la fila (ej. "Anticipo Polpaico"). */
  name: string;
  amountClp: number;
  /** yyyy-MM-dd — cae en la semana de esa fecha. */
  scheduledDate: string;
  /** Opcional: si no se manda, el backend usa la categoría por defecto del kind. */
  categoryId?: string | null;
}

export type CreateResult =
  | { ok: true; id: string | null }
  | { ok: false; error?: string };

export async function createManualEntryViaApi(
  input: CreateManualInput,
): Promise<CreateResult> {
  try {
    const res = await fetch(`/api/finance/cashflow/occurrences/upsert-and-act`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", source: "MANUAL", ...input }),
    });
    const j = await res.json().catch(() => null);
    if (j?.success) return { ok: true, id: j?.data?.id ?? null };
    return { ok: false, error: j?.error ?? "No se pudo crear" };
  } catch {
    return { ok: false, error: "Error de red al crear" };
  }
}
