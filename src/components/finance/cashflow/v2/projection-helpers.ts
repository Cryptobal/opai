import type {
  ProjectionBucket,
  ProjectionAnchorInfo,
  ProjectionMatrix,
  CashflowCellStatus,
} from "@/modules/finance/cashflow/types";
import type { StatusKind } from "@/components/opai-ds";
import { toDate } from "./format";

/** Metadata de celda (folio/estado DTE) que vive en ProjectionRowItemValue,
 *  no en la occurrence. Se indexa por occurrenceId para enriquecer las filas
 *  del detalle (chip de folio, pill de estado, mora). */
export interface OccMeta {
  cellStatus?: CashflowCellStatus;
  dteFolio?: number | null;
  dteId?: string | null;
  daysOverdue?: number;
}

/** Indexa occurrenceId → metadata de celda recorriendo rows → items → values.
 *  Las occurrences virtuales (id null) no tienen folio: caen como PROYECTADA. */
export function buildOccurrenceMeta(
  projection: ProjectionMatrix,
): Map<string, OccMeta> {
  const map = new Map<string, OccMeta>();
  for (const row of projection.rows) {
    for (const item of row.items) {
      for (const v of item.values) {
        if (!v.occurrenceId) continue;
        map.set(v.occurrenceId, {
          cellStatus: v.cellStatus,
          dteFolio: v.dteFolio ?? null,
          dteId: v.dteId ?? null,
          daysOverdue: v.daysOverdue,
        });
      }
    }
  }
  return map;
}

/** Índice del bucket que contiene "hoy" (start ≤ now ≤ end). -1 si ninguno. */
export function currentBucketIndex(buckets: ProjectionBucket[]): number {
  const now = Date.now();
  return buckets.findIndex((b) => {
    const s = toDate(b.start).getTime();
    const e = toDate(b.end).getTime();
    return now >= s && now <= e;
  });
}

/**
 * Un bucket está cerrado/sellado si hay un anchor activo y el bucket termina
 * en o antes de la semana anclada. La proyección solo expone el anchor activo
 * (no todos los cierres), así que tratamos "≤ semana del anchor" como sellado.
 */
export function isBucketClosed(
  bucket: ProjectionBucket,
  anchor: ProjectionAnchorInfo | null,
): boolean {
  if (!anchor) return false;
  return toDate(bucket.end).getTime() <= toDate(anchor.weekEndDate).getTime();
}

/** True si el bucket ya empezó (semana actual o pasada). */
export function isCurrentOrPast(bucket: ProjectionBucket): boolean {
  return toDate(bucket.start).getTime() <= Date.now();
}

/** True si el bucket es exactamente la semana anclada (mismo día calendario). */
export function isAnchorBucket(
  bucket: ProjectionBucket,
  anchor: ProjectionAnchorInfo | null,
): boolean {
  if (!anchor) return false;
  const e = toDate(bucket.end);
  const a = toDate(anchor.weekEndDate);
  return (
    e.getFullYear() === a.getFullYear() &&
    e.getMonth() === a.getMonth() &&
    e.getDate() === a.getDate()
  );
}

/**
 * Semáforo del bucket según el saldo proyectado acumulado. Negativo = rojo
 * (gap real). Apretado (bajo un buffer relativo al saldo de apertura) = ámbar.
 * Holgado = verde.
 */
export function bucketHealthKind(
  projectedClp: number | undefined,
  openingClp: number,
): StatusKind {
  if (projectedClp == null) return "neutral";
  if (projectedClp < 0) return "danger";
  const buffer = Math.max(openingClp * 0.15, 1_000_000);
  if (projectedClp < buffer) return "warn";
  return "ok";
}
