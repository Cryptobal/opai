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

/** Une dos listas indexadas por bucketKey; la primera (prefer) gana en conflicto. */
function mergeByBucketKey<T extends { bucketKey: string }>(
  prefer: T[],
  fallback: T[],
): T[] {
  const m = new Map<string, T>();
  for (const v of prefer) m.set(v.bucketKey, v);
  for (const v of fallback) if (!m.has(v.bucketKey)) m.set(v.bucketKey, v);
  return [...m.values()];
}

/**
 * Valores por bucket: keys en `patchKeys` salen del incoming (si no vienen,
 * se eliminan); el resto de base queda intacto.
 */
function replaceValuesByPatchKeys<T extends { bucketKey: string }>(
  base: T[],
  incoming: T[],
  patchKeys: Set<string>,
): T[] {
  const m = new Map<string, T>();
  for (const v of base) {
    if (!patchKeys.has(v.bucketKey)) m.set(v.bucketKey, v);
  }
  for (const v of incoming) {
    if (patchKeys.has(v.bucketKey)) m.set(v.bucketKey, v);
  }
  return [...m.values()];
}

/** Merge de filas por (kind · categoría) e items por itemId. */
function combineRows(
  base: ProjectionRow[],
  incoming: ProjectionRow[],
  mergeBucketVals: <T extends { bucketKey: string }>(a: T[], b: T[]) => T[],
): ProjectionRow[] {
  const order: string[] = [];
  const groups = new Map<
    string,
    { row: ProjectionRow; items: Map<string, ProjectionRowItemDetail> }
  >();
  const ingest = (rows: ProjectionRow[], isIncoming: boolean) => {
    for (const row of rows) {
      const gk = `${row.kind}|${row.categoryCode}`;
      let g = groups.get(gk);
      if (!g) {
        g = { row: { ...row, values: [], items: [] }, items: new Map() };
        groups.set(gk, g);
        order.push(gk);
      }
      if (isIncoming) {
        g.row = {
          ...g.row,
          ...row,
          values: mergeBucketVals(g.row.values, row.values),
        };
      } else {
        g.row = {
          ...g.row,
          values: mergeBucketVals(row.values, g.row.values),
        };
      }
      for (const item of row.items) {
        const prev = g.items.get(item.itemId);
        const values = isIncoming
          ? mergeBucketVals(prev?.values ?? [], item.values)
          : mergeBucketVals(item.values, prev?.values ?? []);
        g.items.set(item.itemId, {
          ...(prev ?? item),
          ...item,
          values,
          total: sumAmount(values),
          totalActual: sumActual(values),
        });
      }
    }
  };
  ingest(base, false);
  ingest(incoming, true);
  return order.map((gk) => {
    const g = groups.get(gk)!;
    const items = [...g.items.values()];
    return { ...g.row, items, total: items.reduce((s, i) => s + i.total, 0) };
  });
}

/** Merge de filas: base gana en las keys de bucket ya presentes. */
function mergeRows(
  base: ProjectionRow[],
  incoming: ProjectionRow[],
): ProjectionRow[] {
  return combineRows(base, incoming, mergeByBucketKey);
}

/** Filas con parche: keys del incoming ganan; ausentes en incoming se dropean. */
function replaceRows(
  base: ProjectionRow[],
  incoming: ProjectionRow[],
  patchKeys: Set<string>,
): ProjectionRow[] {
  return combineRows(base, incoming, (a, b) =>
    replaceValuesByPatchKeys(a, b, patchKeys),
  );
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

/**
 * Parche F4: para cada `bucketKey` de `incoming`, buckets / values /
 * cumulative* se reemplazan (incoming gana). Keys de base fuera del parche
 * quedan intactas. Filas/items nuevos del incoming se agregan.
 */
export function replaceWeeks(
  base: ProjectionMatrix,
  incoming: ProjectionMatrix,
): ProjectionMatrix {
  const patchKeys = new Set(incoming.buckets.map((b) => b.key));
  if (patchKeys.size === 0) return base;

  const bucketsByKey = new Map(base.buckets.map((b) => [b.key, b]));
  for (const b of incoming.buckets) bucketsByKey.set(b.key, b);
  const buckets = [...bucketsByKey.values()].sort(
    (a, b) => toDate(a.start).getTime() - toDate(b.start).getTime(),
  );

  return {
    ...base,
    buckets,
    rows: replaceRows(base.rows, incoming.rows, patchKeys),
    cumulativeBalances: replaceValuesByPatchKeys(
      base.cumulativeBalances,
      incoming.cumulativeBalances,
      patchKeys,
    ),
    cumulativePoints: replaceValuesByPatchKeys(
      base.cumulativePoints,
      incoming.cumulativePoints,
      patchKeys,
    ),
    // Ancla / opening del server parcial pueden ser más frescos tras mutación.
    anchor: incoming.anchor ?? base.anchor,
    openingBalanceClp: incoming.openingBalanceClp ?? base.openingBalanceClp,
  };
}

/**
 * Elimina de la matriz las semanas cuyas `key ∈ keys` (buckets, values de
 * filas/items, cumulativeBalances/Points). Puro: no muta. Tras `dropWeeks`,
 * `ensureRange` ve huecos (`!present.has(weekKey)`) y re-fetchea sólo ese rango;
 * el merge posterior (base gana) rellena sin conflicto porque las keys ya no
 * están en base.
 */
export function dropWeeks(
  matrix: ProjectionMatrix,
  keys: string[],
): ProjectionMatrix {
  if (keys.length === 0) return matrix;
  const drop = new Set(keys);
  const keep = (bucketKey: string) => !drop.has(bucketKey);
  return {
    ...matrix,
    buckets: matrix.buckets.filter((b) => keep(b.key)),
    rows: matrix.rows.map((row) => ({
      ...row,
      values: row.values.filter((v) => keep(v.bucketKey)),
      items: row.items.map((item) => ({
        ...item,
        values: item.values.filter((v) => keep(v.bucketKey)),
      })),
    })),
    cumulativeBalances: matrix.cumulativeBalances.filter((p) =>
      keep(p.bucketKey),
    ),
    cumulativePoints: matrix.cumulativePoints.filter((p) =>
      keep(p.bucketKey),
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
