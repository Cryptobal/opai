import type {
  ProjectionBucket,
  ProjectionAnchorInfo,
} from "@/modules/finance/cashflow/types";
import type { StatusKind } from "@/components/opai-ds";
import { toDate } from "./format";

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
