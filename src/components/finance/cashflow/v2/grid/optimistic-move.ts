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
