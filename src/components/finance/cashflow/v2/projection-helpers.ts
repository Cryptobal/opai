import type {
  ProjectionBucket,
  ProjectionAnchorInfo,
  ProjectionMatrix,
  CashflowCellStatus,
  FinanceCashflowItemSource,
  VirtualOccurrence,
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

/** Sources que se reparten por instalación/guardia: una occurrence por entidad,
 *  decenas de filas por semana. En el detalle se consolidan en una sola línea
 *  con total y desglose expandible. El resto (CONTRACT, SUPPLIER, MANUAL, IVA…)
 *  representa una entidad relevante por línea ⇒ se dejan individuales. */
export const CONSOLIDATED_SOURCES = new Set<FinanceCashflowItemSource>([
  "TURNOS_EXTRA",
  "PAYROLL",
  "PAYROLL_LIQUIDO",
  "PAYROLL_PREVIRED",
  "QUINCENA",
]);

/** Etiqueta estable de consolidación por source. PAYROLL y PAYROLL_LIQUIDO
 *  caen en la misma línea "Remuneraciones". */
const GROUP_LABELS: Partial<Record<FinanceCashflowItemSource, string>> = {
  TURNOS_EXTRA: "Turnos extra",
  PAYROLL: "Remuneraciones",
  PAYROLL_LIQUIDO: "Remuneraciones",
  PAYROLL_PREVIRED: "Previred",
  QUINCENA: "Quincena (anticipos)",
};

/** Clave/etiqueta de consolidación de una occurrence, o null si va individual. */
export function groupKeyFor(o: VirtualOccurrence): string | null {
  if (!CONSOLIDATED_SOURCES.has(o.source)) return null;
  return GROUP_LABELS[o.source] ?? null;
}

/** Fila del detalle: grupo consolidado (con desglose) o movimiento individual. */
export type DetailRow =
  | {
      type: "group";
      label: string;
      source: FinanceCashflowItemSource;
      totalClp: number;
      items: VirtualOccurrence[];
    }
  | { type: "single"; occ: VirtualOccurrence };

function rowAmount(r: DetailRow): number {
  return Math.abs(r.type === "group" ? r.totalClp : r.occ.amountClp);
}

/**
 * Transforma las occurrences de una sección (Entra/Sale) en filas para el
 * detalle: las consolidables se agrupan en una línea con total y desglose; las
 * individuales pasan tal cual; las de monto 0 quedan fuera (cuentan en
 * `zeroCount` para el botón "+N sin monto"). Filas y desgloses van por monto
 * absoluto desc; el sort estable mantiene el orden de inserción ante empates.
 */
export function buildDetailRows(occurrences: VirtualOccurrence[]): {
  rows: DetailRow[];
  zeroCount: number;
} {
  let zeroCount = 0;
  const groups = new Map<
    string,
    {
      label: string;
      source: FinanceCashflowItemSource;
      totalClp: number;
      items: VirtualOccurrence[];
    }
  >();
  const singles: VirtualOccurrence[] = [];

  for (const o of occurrences) {
    if (o.amountClp === 0) {
      zeroCount += 1;
      continue;
    }
    const key = groupKeyFor(o);
    if (key == null) {
      singles.push(o);
      continue;
    }
    const g = groups.get(key);
    if (g) {
      g.totalClp += o.amountClp;
      g.items.push(o);
    } else {
      groups.set(key, {
        label: key,
        source: o.source,
        totalClp: o.amountClp,
        items: [o],
      });
    }
  }

  const rows: DetailRow[] = [
    ...[...groups.values()].map(
      (g): DetailRow => ({
        type: "group",
        label: g.label,
        source: g.source,
        totalClp: g.totalClp,
        items: [...g.items].sort(
          (a, b) => Math.abs(b.amountClp) - Math.abs(a.amountClp),
        ),
      }),
    ),
    ...singles.map((occ): DetailRow => ({ type: "single", occ })),
  ];

  rows.sort((a, b) => rowAmount(b) - rowAmount(a));
  return { rows, zeroCount };
}
