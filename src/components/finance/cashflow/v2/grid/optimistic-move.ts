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

/** Celda creada optimistamente (create inline): pinta el monto en la celda
 *  vacía hasta que refreshWeeks reconcilie. */
export interface PendingCreate {
  itemId: string;
  bucketKey: string;
  amount: number;
}

/** Inserta/fija el monto de una celda creada (puro). Si el bucket no existía
 *  en values, lo agrega. */
export function applyOptimisticCreates(
  rows: ProjectionRow[],
  creates: PendingCreate[],
): ProjectionRow[] {
  if (creates.length === 0) return rows;
  const byItem = new Map<string, Map<string, number>>();
  for (const c of creates) {
    if (!c.itemId) continue;
    const m = byItem.get(c.itemId) ?? new Map<string, number>();
    m.set(c.bucketKey, c.amount);
    byItem.set(c.itemId, m);
  }
  return rows.map((row) => {
    if (!(row.items ?? []).some((it) => byItem.has(it.itemId))) return row;
    const deltaByBucket = new Map<string, number>();
    const items = (row.items ?? []).map((it) => {
      const m = byItem.get(it.itemId);
      if (!m) return it;
      const values = [...it.values];
      for (const [bucketKey, amount] of m) {
        const idx = values.findIndex((v) => v.bucketKey === bucketKey);
        if (idx >= 0) {
          const prev = values[idx].amount;
          deltaByBucket.set(
            bucketKey,
            (deltaByBucket.get(bucketKey) ?? 0) + (amount - prev),
          );
          values[idx] = {
            ...values[idx],
            amount,
            occurrenceId: values[idx].occurrenceId ?? `tmp-create`,
          };
        } else {
          deltaByBucket.set(
            bucketKey,
            (deltaByBucket.get(bucketKey) ?? 0) + amount,
          );
          values.push({
            bucketKey,
            amount,
            actualAmount: null,
            occurrenceId: `tmp-create`,
            scheduledDate: "",
            dteId: null,
            cellStatus: "PROJECTED",
          });
        }
      }
      return { ...it, values };
    });
    // Asegurar bucket-sum de la fila también tiene las keys nuevas.
    let rowValues = row.values ?? [];
    for (const [bucketKey, delta] of deltaByBucket) {
      if (!rowValues.some((v) => v.bucketKey === bucketKey)) {
        rowValues = [...rowValues, { bucketKey, amount: 0 }];
      }
    }
    return {
      ...row,
      items,
      values: reflectBucketDeltas({ ...row, values: rowValues }, deltaByBucket),
    };
  });
}

/** Entrada de la cola de mutaciones optimistas (F1/F2). Cada una se limpia por
 *  `id` al reconciliar — nunca un clear global. */
export type PendingEntry =
  | ({ id: string; kind: "move" } & PendingMove)
  | ({ id: string; kind: "hide" } & PendingHide)
  | ({ id: string; kind: "amount" } & PendingAmount)
  | ({ id: string; kind: "create" } & PendingCreate);

export function newPendingId(): string {
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function removePendingById(
  pending: PendingEntry[],
  id: string,
): PendingEntry[] {
  return pending.filter((p) => p.id !== id);
}

/** Aplica la cola completa en orden (puro). Varios amounts/hides coexisten. */
export function applyAllPending(
  rows: ProjectionRow[],
  pending: PendingEntry[],
): ProjectionRow[] {
  let out = rows;
  for (const p of pending) {
    if (p.kind === "move") out = applyOptimisticMove(out, p);
    else if (p.kind === "hide") out = applyOptimisticHides(out, [p]);
    else if (p.kind === "amount") out = applyOptimisticAmounts(out, [p]);
    else out = applyOptimisticCreates(out, [p]);
  }
  return out;
}

