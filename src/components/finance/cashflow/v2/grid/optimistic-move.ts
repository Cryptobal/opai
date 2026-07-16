import type {
  ProjectionRow,
  ProjectionRowItemDetail,
  ProjectionRowItemValue,
} from "@/modules/finance/cashflow/types";

/** Move en curso, aplicado a la proyección visible ANTES de que vuelva el
 *  refresh de red. Vacía la celda de origen y pinta el chip en el destino al
 *  instante (el usuario ya no ve la cuota "pegada" en la semana vieja). */
export interface PendingMove {
  itemId: string;
  fromBucketKey: string;
  toBucketKey: string;
}

function moveItemValue(
  it: ProjectionRowItemDetail,
  from: string,
  to: string,
): ProjectionRowItemDetail | null {
  const src = it.values.find((v) => v.bucketKey === from);
  // Guardas de idempotencia: si el origen ya no tiene monto (p.ej. el refresh
  // ya llegó y movió la cuota), no re-aplicamos nada. Evita el doble-move en el
  // render intermedio entre `refresh()` y limpiar el pending.
  if (!src || src.amount === 0) return null;

  const movedAmount = src.amount;
  const hasTarget = it.values.some((v) => v.bucketKey === to);
  const values: ProjectionRowItemValue[] = it.values.map((v) => {
    if (v.bucketKey === from) {
      // Vaciar origen: sin monto → la celda pinta "·"; sin ids → no draggable.
      return { ...v, amount: 0, occurrenceId: null, dteId: null };
    }
    if (v.bucketKey === to) {
      return { ...src, bucketKey: to };
    }
    return v;
  });
  if (!hasTarget) values.push({ ...src, bucketKey: to });

  return { ...it, values };
}

/**
 * Aplica un move optimista a las filas de la proyección. Puro: no muta.
 * Ajusta el valor del item movido (origen → destino) y también el bucket-sum
 * de la fila contenedora, para que ni el chip ni el subtotal de la fila queden
 * inconsistentes durante el segundo que tarda el refresh.
 */
export function applyOptimisticMove(
  rows: ProjectionRow[],
  pending: PendingMove | null,
): ProjectionRow[] {
  if (!pending) return rows;
  const { itemId, fromBucketKey: from, toBucketKey: to } = pending;

  return rows.map((row) => {
    if (!(row.items ?? []).some((it) => it.itemId === itemId)) return row;

    let movedAmount = 0;
    const items = (row.items ?? []).map((it) => {
      if (it.itemId !== itemId) return it;
      const patched = moveItemValue(it, from, to);
      if (!patched) return it;
      movedAmount = it.values.find((v) => v.bucketKey === from)?.amount ?? 0;
      return patched;
    });
    if (movedAmount === 0) return { ...row, items };

    // Reflejar el traspaso en el bucket-sum de la fila (header del cliente).
    const values = (row.values ?? []).map((v) => {
      if (v.bucketKey === from) return { ...v, amount: v.amount - movedAmount };
      if (v.bucketKey === to) return { ...v, amount: v.amount + movedAmount };
      return v;
    });
    return { ...row, items, values };
  });
}

/** Celda ocultada del flujo, aplicada ANTES de que vuelva el refresh: se vacía
 *  al instante (amount 0, sin ids) para que la fila desaparezca sin esperar la
 *  re-proyección de red. */
export interface PendingHide {
  itemId: string;
  bucketKey: string;
}

/** Monto editado, aplicado ANTES del refresh: la celda muestra el nuevo valor
 *  al instante en vez de esperar el round-trip. */
export interface PendingAmount {
  itemId: string;
  bucketKey: string;
  amount: number;
}

/** Suma un delta por bucket al bucket-sum de la fila (header del cliente), para
 *  que el subtotal no quede inconsistente durante el segundo del refresh. */
function reflectBucketDeltas(
  row: ProjectionRow,
  deltaByBucket: Map<string, number>,
): ProjectionRow["values"] {
  if (deltaByBucket.size === 0) return row.values ?? [];
  return (row.values ?? []).map((v) =>
    deltaByBucket.has(v.bucketKey)
      ? { ...v, amount: v.amount + (deltaByBucket.get(v.bucketKey) ?? 0) }
      : v,
  );
}

/** Vacía optimistamente las celdas ocultadas (amount 0, sin ids → pinta "·" y
 *  no es arrastrable). Puro. Idempotente: una celda ya en 0 no vuelve a tocarse. */
export function applyOptimisticHides(
  rows: ProjectionRow[],
  hides: PendingHide[],
): ProjectionRow[] {
  if (hides.length === 0) return rows;
  const byItem = new Map<string, Set<string>>();
  for (const h of hides) {
    if (!h.itemId) continue;
    const set = byItem.get(h.itemId) ?? new Set<string>();
    set.add(h.bucketKey);
    byItem.set(h.itemId, set);
  }
  return rows.map((row) => {
    if (!(row.items ?? []).some((it) => byItem.has(it.itemId))) return row;
    const deltaByBucket = new Map<string, number>();
    const items = (row.items ?? []).map((it) => {
      const buckets = byItem.get(it.itemId);
      if (!buckets) return it;
      const values = it.values.map((v) => {
        if (buckets.has(v.bucketKey) && v.amount !== 0) {
          deltaByBucket.set(
            v.bucketKey,
            (deltaByBucket.get(v.bucketKey) ?? 0) - v.amount,
          );
          return { ...v, amount: 0, occurrenceId: null, dteId: null };
        }
        return v;
      });
      return { ...it, values };
    });
    return { ...row, items, values: reflectBucketDeltas(row, deltaByBucket) };
  });
}

/** Fija optimistamente el nuevo monto de las celdas editadas (mantiene ids para
 *  que sigan editables/arrastrables). Puro. */
export function applyOptimisticAmounts(
  rows: ProjectionRow[],
  amounts: PendingAmount[],
): ProjectionRow[] {
  if (amounts.length === 0) return rows;
  const byItem = new Map<string, Map<string, number>>();
  for (const a of amounts) {
    if (!a.itemId) continue;
    const m = byItem.get(a.itemId) ?? new Map<string, number>();
    m.set(a.bucketKey, a.amount);
    byItem.set(a.itemId, m);
  }
  return rows.map((row) => {
    if (!(row.items ?? []).some((it) => byItem.has(it.itemId))) return row;
    const deltaByBucket = new Map<string, number>();
    const items = (row.items ?? []).map((it) => {
      const m = byItem.get(it.itemId);
      if (!m) return it;
      const values = it.values.map((v) => {
        if (m.has(v.bucketKey)) {
          const next = m.get(v.bucketKey) ?? v.amount;
          deltaByBucket.set(
            v.bucketKey,
            (deltaByBucket.get(v.bucketKey) ?? 0) + (next - v.amount),
          );
          return { ...v, amount: next };
        }
        return v;
      });
      return { ...it, values };
    });
    return { ...row, items, values: reflectBucketDeltas(row, deltaByBucket) };
  });
}
