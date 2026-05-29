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

/** True si "hoy" cae dentro del bucket (start ≤ now ≤ end). */
export function isCurrentBucket(bucket: ProjectionBucket): boolean {
  const now = Date.now();
  return toDate(bucket.start).getTime() <= now && now <= toDate(bucket.end).getTime();
}

/**
 * True si el bucket cuenta como "cerrado manual": hay un anchor activo manual
 * y el bucket termina en o antes de la semana anclada. Simplificación: solo
 * conocemos el anchor activo, no el cierre puntual de cada semana, así que
 * todos los buckets ≤ anchor manual se pintan como cerrados manual.
 */
export function isBucketManualClose(
  bucket: ProjectionBucket,
  anchor: ProjectionAnchorInfo | null,
): boolean {
  if (!anchor || !anchor.isManual) return false;
  return toDate(bucket.end).getTime() <= toDate(anchor.weekEndDate).getTime();
}

/** Motivo del cierre manual aplicable al bucket (null si no es manual-cerrado). */
export function manualReasonFor(
  bucket: ProjectionBucket,
  anchor: ProjectionAnchorInfo | null,
): string | null {
  if (!isBucketManualClose(bucket, anchor)) return null;
  return anchor?.manualReason ?? null;
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
  "MANUAL",
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
  if (o.source === "MANUAL") {
    return o.kind === "INCOME" ? "Ingresos manuales" : "Egresos manuales";
  }
  return GROUP_LABELS[o.source] ?? null;
}

/** Fila del detalle: grupo consolidado (con desglose), movimiento individual,
 *  o separador visual ("lo que viene" en la semana actual). */
export type DetailRow =
  | {
      type: "group";
      label: string;
      source: FinanceCashflowItemSource;
      totalClp: number;
      items: VirtualOccurrence[];
    }
  | { type: "single"; occ: VirtualOccurrence }
  | { type: "separator"; label: string };

function rowAmount(r: DetailRow): number {
  if (r.type === "separator") return 0;
  return Math.abs(r.type === "group" ? r.totalClp : r.occ.amountClp);
}

/** Suma de montos de una fila (0 para separadores). */
export function detailRowAmount(r: DetailRow): number {
  if (r.type === "separator") return 0;
  return r.type === "group" ? r.totalClp : r.occ.amountClp;
}

/** Cuenta de movimientos reales de una fila (groups cuentan su tamaño). */
export function detailRowCount(r: DetailRow): number {
  if (r.type === "separator") return 0;
  return r.type === "group" ? r.items.length : 1;
}

function occIso(o: VirtualOccurrence): string {
  return toDate(o.scheduledDate).toISOString().slice(0, 10);
}

/**
 * Transforma las occurrences de una sección (Entra/Sale) en filas para el
 * detalle: las consolidables se agrupan en una línea con total y desglose; las
 * individuales pasan tal cual; las de monto 0 quedan fuera (cuentan en
 * `zeroCount` para el botón "+N sin monto"). Filas y desgloses van por monto
 * absoluto desc; el sort estable mantiene el orden de inserción ante empates.
 */
export function buildDetailRows(
  occurrences: VirtualOccurrence[],
  ctx?: { isCurrent?: boolean; todayIso?: string },
): {
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

  // Desconsolidar grupos MANUAL con un solo item (cuando hay solo 1 ingreso/egreso
  // manual, mostrarlo con su concepto real, no como "Ingresos manuales · 1").
  // Los otros sources (PAYROLL, TURNOS_EXTRA, etc.) siempre se consolidan,
  // incluso con 1 item, porque su label es un concepto agregado por diseño.
  for (const [key, g] of [...groups.entries()]) {
    if (g.source === "MANUAL" && g.items.length === 1) {
      singles.push(g.items[0]);
      groups.delete(key);
    }
  }

  const groupRows: DetailRow[] = [...groups.values()].map(
    (g): DetailRow => ({
      type: "group",
      label: g.label,
      source: g.source,
      totalClp: g.totalClp,
      items: [...g.items].sort(
        (a, b) => Math.abs(b.amountClp) - Math.abs(a.amountClp),
      ),
    }),
  );

  // En la semana actual ordenamos las filas individuales cronológicamente e
  // inyectamos el separador "lo que viene" entre lo de hoy/pasado y lo futuro.
  // En el resto de buckets mantenemos el orden por monto absoluto desc.
  if (ctx?.isCurrent && ctx.todayIso) {
    groupRows.sort((a, b) => rowAmount(b) - rowAmount(a));
    const sorted = [...singles].sort(
      (a, b) => toDate(a.scheduledDate).getTime() - toDate(b.scheduledDate).getTime(),
    );
    const singleRows: DetailRow[] = [];
    let inserted = false;
    for (const o of sorted) {
      if (!inserted && occIso(o) > ctx.todayIso) {
        singleRows.push({ type: "separator", label: "lo que viene" });
        inserted = true;
      }
      singleRows.push({ type: "single", occ: o });
    }
    return { rows: [...groupRows, ...singleRows], zeroCount };
  }

  const rows: DetailRow[] = [
    ...groupRows,
    ...singles.map((occ): DetailRow => ({ type: "single", occ })),
  ];
  rows.sort((a, b) => rowAmount(b) - rowAmount(a));
  return { rows, zeroCount };
}

/** Nivel "fuerza" de una occurrence:
 *  - "weak"   = proyección pura, sin DTE ni bank tx. Regenerable por cron.
 *  - "strong" = tiene DTE (borrador o emitido) o ya está conciliada con banco.
 *               Representa un hecho real, no una predicción. */
export type OccurrenceLevel = "weak" | "strong";

export function occurrenceLevel(occ: {
  dteId: string | null;
  bankTransactionId: string | null;
  status?: string | null;
}): OccurrenceLevel {
  if (occ.dteId != null) return "strong";
  if (occ.bankTransactionId != null) return "strong";
  if (occ.status === "PAID" || occ.status === "CONFIRMED") return "strong";
  return "weak";
}

/** ¿Esta occurrence puede borrarse desde el flujo? Solo proyecciones puras
 *  (weak) que no sean ajustes automáticos de cierre. */
export function canDeleteOccurrence(occ: VirtualOccurrence & { isClosingAdjust?: boolean }): boolean {
  // Política A: solo manuales se borran desde el flujo. Para contratos /
  // recurring DTE / payroll / quincenas / etc., el cron las regenera; hay
  // que ir a la fuente (contrato, template DTE, configuración) para sacarlas.
  if (occ.source !== "MANUAL") return false;
  if (occurrenceLevel(occ) !== "weak") return false;
  if ((occ as { isClosingAdjust?: boolean }).isClosingAdjust) return false;
  if (!occ.id) return false; // virtuales no se pueden borrar (no existen en DB)
  return true;
}
