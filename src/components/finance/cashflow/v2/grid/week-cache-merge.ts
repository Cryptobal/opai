import type {
  ProjectionMatrix,
  ProjectionRow,
  ProjectionRowItemDetail,
  ProjectionRowItemValue,
} from "@/modules/finance/cashflow/types";
import { toDate } from "../format";
import { emptyBucket, type WeekSlot } from "./week-keys";

/**
 * Merge/slice de matrices de proyección indexado por bucketKey.
 *
 * `buildProjection` devuelve, en CADA fetch, TODAS las filas del tenant con sus
 * `values` para los buckets del rango pedido. Para que navegar a una ventana
 * armada con semanas de fetches distintos pinte cada celda (y no sólo las del
 * último fetch), acumulamos por bucketKey: buckets, `values` de cada item, y los
 * puntos de saldo acumulado. Política: una key ya cacheada NO se sobrescribe
 * (el Bloque 1 garantiza que su valor es estable) — sólo `invalidate()` la
 * limpia, vía un merge desde `null`.
 */

const sumAmount = (vs: ProjectionRowItemValue[]) =>
  vs.reduce((s, v) => s + v.amount, 0);
const sumActual = (vs: ProjectionRowItemValue[]) =>
  vs.reduce((s, v) => s + (v.actualAmount ?? 0), 0);

/** Une dos listas indexadas por bucketKey; la primera (base) gana en conflicto. */
function mergeByBucketKey<T extends { bucketKey: string }>(
  base: T[],
  next: T[],
): T[] {
  const m = new Map<string, T>();
  for (const v of base) m.set(v.bucketKey, v);
  for (const v of next) if (!m.has(v.bucketKey)) m.set(v.bucketKey, v);
  return [...m.values()];
}

/** Merge de filas por (kind · categoría) e items por itemId; base gana en las
 *  keys de bucket ya presentes. Recalcula totales desde los values fusionados. */
function mergeRows(
  base: ProjectionRow[],
  incoming: ProjectionRow[],
): ProjectionRow[] {
  const order: string[] = [];
  const groups = new Map<
    string,
    { row: ProjectionRow; items: Map<string, ProjectionRowItemDetail> }
  >();
  const ingest = (rows: ProjectionRow[]) => {
    for (const row of rows) {
      const gk = `${row.kind}|${row.categoryCode}`;
      let g = groups.get(gk);
      if (!g) {
        g = { row: { ...row, values: [], items: [] }, items: new Map() };
        groups.set(gk, g);
        order.push(gk);
      }
      g.row = { ...g.row, values: mergeByBucketKey(g.row.values, row.values) };
      for (const item of row.items) {
        const prev = g.items.get(item.itemId);
        const values = mergeByBucketKey(prev?.values ?? [], item.values);
        g.items.set(item.itemId, {
          ...(prev ?? item),
          ...item, // metadata más reciente
          values,
          total: sumAmount(values),
          totalActual: sumActual(values),
        });
      }
    }
  };
  ingest(base);
  ingest(incoming);
  return order.map((gk) => {
    const g = groups.get(gk)!;
    const items = [...g.items.values()];
    return { ...g.row, items, total: items.reduce((s, i) => s + i.total, 0) };
  });
}

/** Fusiona `incoming` sobre `base`. `base=null` (invalidate) parte de cero. */
export function mergeMatrix(
  base: ProjectionMatrix | null,
  incoming: ProjectionMatrix,
): ProjectionMatrix {
  if (!base) return incoming;
  const bucketsByKey = new Map(incoming.buckets.map((b) => [b.key, b]));
  for (const b of base.buckets) bucketsByKey.set(b.key, b); // base gana
  const buckets = [...bucketsByKey.values()].sort(
    (a, b) => toDate(a.start).getTime() - toDate(b.start).getTime(),
  );
  return {
    ...incoming,
    buckets,
    rows: mergeRows(base.rows, incoming.rows),
    cumulativeBalances: mergeByBucketKey(
      base.cumulativeBalances,
      incoming.cumulativeBalances,
    ),
    cumulativePoints: mergeByBucketKey(
      base.cumulativePoints,
      incoming.cumulativePoints,
    ),
  };
}

/** Recorta la matriz fusionada a las columnas visibles (en el orden de `slots`).
 *  Cada slot resuelve a su bucket cacheado o a un placeholder vacío. */
export function sliceMatrix(
  merged: ProjectionMatrix,
  slots: WeekSlot[],
): ProjectionMatrix {
  const keys = new Set(slots.map((s) => s.key));
  const byKey = new Map(merged.buckets.map((b) => [b.key, b]));
  return {
    ...merged,
    range: {
      from: slots[0]?.start ?? merged.range.from,
      to: slots[slots.length - 1]?.end ?? merged.range.to,
      granularity: "weekly",
    },
    buckets: slots.map((s) => byKey.get(s.key) ?? emptyBucket(s)),
    rows: merged.rows.map((row) => ({
      ...row,
      values: row.values.filter((v) => keys.has(v.bucketKey)),
      items: row.items.map((item) => ({
        ...item,
        values: item.values.filter((v) => keys.has(v.bucketKey)),
      })),
    })),
    cumulativeBalances: merged.cumulativeBalances.filter((p) =>
      keys.has(p.bucketKey),
    ),
    cumulativePoints: merged.cumulativePoints.filter((p) =>
      keys.has(p.bucketKey),
    ),
  };
}
