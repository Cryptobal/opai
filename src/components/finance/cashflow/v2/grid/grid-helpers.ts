import type {
  FinanceCashflowItemKind,
  FinanceCashflowItemSource,
  ProjectionAnchorInfo,
  ProjectionBucket,
  ProjectionRow,
  ProjectionRowItemDetail,
  ProjectionRowItemValue,
} from "@/modules/finance/cashflow/types";
import {
  pillVariantFor,
  type PillVariant,
} from "@/components/finance/cashflow/CellStatusPill";
import {
  isAnchorBucket,
  isBucketClosed,
  isBucketManualClose,
} from "../projection-helpers";
import { toDate } from "../format";

/** Una fila de la grilla = una línea de contrato/instalación (item). Se aplana
 *  desde rows → items para que cada cliente/contrato ocupe su propia fila,
 *  ordenada por cliente y luego instalación. */
export interface GridItemRow {
  item: ProjectionRowItemDetail;
  /** Lookup de valor por bucketKey para pintar cada celda en O(1). */
  valueByBucket: Map<string, ProjectionRowItemValue>;
  /** Presente SOLO en filas de egreso agrupado (B3): la fila suma N
   *  instalaciones de un mismo tipo de gasto (sueldos/previred/turnos).
   *  `source` identifica el tipo; `occurrenceIdsByBucket` lista, por bucket,
   *  los occurrenceId movibles (no pagados) de esas instalaciones — el gesto
   *  de arrastre (B4A) mueve todos juntos a la semana destino. */
  group?: {
    source: FinanceCashflowItemSource;
    occurrenceIdsByBucket: Map<string, string[]>;
  };
}

/** Aplana las filas de una sección (INCOME/EXPENSE) en filas-item ordenadas
 *  por cuenta CRM (cliente) y luego instalación/nickname. */
export function itemRowsForKind(
  rows: ProjectionRow[],
  kind: FinanceCashflowItemKind,
): GridItemRow[] {
  const items = rows
    .filter((r) => r.kind === kind)
    .flatMap((r) => r.items);
  const gridRows = items.map((item) => ({
    item,
    valueByBucket: new Map(item.values.map((v) => [v.bucketKey, v])),
  }));
  gridRows.sort((a, b) =>
    itemSortKey(a.item).localeCompare(itemSortKey(b.item), "es", {
      sensitivity: "base",
    }),
  );
  return gridRows;
}

/** Cuenta␟instalación; sin cuenta va al final. */
function itemSortKey(i: ProjectionRowItemDetail): string {
  const cuenta = i.crmAccountName ?? "￿";
  const inst = i.installationName ?? i.nickname ?? i.itemName ?? "";
  return `${cuenta} ${inst}`;
}

/** Etiqueta principal (cliente) y tag secundario (instalación/nickname) de la
 *  columna sticky. Cuando no hay cuenta CRM cae al nombre técnico del item.
 *  La instalación se muestra SIEMPRE (aunque coincida con el nombre del
 *  cliente): el usuario prefiere verla redundante que no verla (ej. venta
 *  "Ametel" → "Ametel algarrobo"). Las filas de egreso agrupado (B3) traen
 *  installationName=null/nickname=null, por lo que su tag queda en null y el
 *  primary es la categoría — sin ensuciar el caso agregado. */
export function rowLabels(item: ProjectionRowItemDetail): {
  primary: string;
  tag: string | null;
} {
  const primary = item.crmAccountName ?? item.itemName;
  const tag = item.installationName ?? item.nickname ?? null;
  return { primary, tag };
}

/** Banda de mes en el header: agrupa columnas contiguas del mismo mes. */
export interface MonthBand {
  key: string;
  label: string;
  span: number;
  /** Tono alterno entre meses consecutivos para leer la agrupación. */
  even: boolean;
}

/** Agrupa buckets contiguos por mes (del lunes de cada semana) con colspan y
 *  tono alterno. La semana que cruza dos meses se atribuye al mes de su inicio. */
export function monthBands(buckets: ProjectionBucket[]): MonthBand[] {
  const bands: MonthBand[] = [];
  let monthIdx = -1;
  for (const b of buckets) {
    const d = toDate(b.start);
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
    const last = bands[bands.length - 1];
    if (last && last.key === key) {
      last.span += 1;
      continue;
    }
    monthIdx += 1;
    bands.push({
      key,
      label: d
        .toLocaleDateString("es-CL", {
          month: "short",
          year: "2-digit",
          timeZone: "UTC",
        })
        .replace(".", ""),
      span: 1,
      even: monthIdx % 2 === 0,
    });
  }
  return bands;
}

/** Subtotal por bucket de una sección (suma de los montos de sus filas-item). */
export function sectionBucketTotals(
  rows: GridItemRow[],
  buckets: ProjectionBucket[],
): number[] {
  return buckets.map((b) =>
    rows.reduce(
      (s, r) => s + (r.valueByBucket.get(b.key)?.amount ?? 0),
      0,
    ),
  );
}

/** Número de semana ISO (para el eyebrow del header). */
export function isoWeek(date: Date): number {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

/** Egresos del sistema (payroll, previred, IVA, turnos extra, quincena, retiro
 *  de socios): se muestran pero no se arrastran — su fecha la manda la
 *  configuración/cron, no un gesto de la planilla. */
export const SYSTEM_SOURCES: ReadonlySet<FinanceCashflowItemSource> = new Set([
  "PAYROLL",
  "PAYROLL_LIQUIDO",
  "PAYROLL_PREVIRED",
  "IVA",
  "TURNOS_EXTRA",
  "QUINCENA",
  "RETIRO_SOCIO",
]);

/** ¿La cuota de este item (por su source) admite arrastre? */
export function isDraggableSource(source: FinanceCashflowItemSource): boolean {
  return !SYSTEM_SOURCES.has(source);
}

/** Estado de sellado de una columna respecto al cierre semanal anclado.
 *  `closed` → semana sellada (≤ anchor). `anchor` → es exactamente la semana
 *  anclada (frontera real/proyectado → línea de ancla). `manualClosed` →
 *  cerrada con saldo forzado. */
export interface BucketMeta {
  closed: boolean;
  anchor: boolean;
  manualClosed: boolean;
}

/** Indexa bucketKey → estado de sellado usando el anchor de la proyección. */
export function buildBucketMeta(
  buckets: ProjectionBucket[],
  anchor: ProjectionAnchorInfo | null,
): Map<string, BucketMeta> {
  const map = new Map<string, BucketMeta>();
  for (const b of buckets) {
    map.set(b.key, {
      closed: isBucketClosed(b, anchor),
      anchor: isAnchorBucket(b, anchor),
      manualClosed: isBucketManualClose(b, anchor),
    });
  }
  return map;
}

const VARIANT_TITLE: Record<PillVariant, string> = {
  PROJECTED: "Programada",
  DRAFT: "Borrador",
  INVOICED: "Facturada",
  FACTORING: "Factorizada",
  FACTORING_COLLECTED: "Factorizada · cobrada",
  PAID: "Pagada",
  OVERDUE: "Vencida",
  VOIDED: "Anulada",
};

/** Estado visual + affordances de una celda con cuota: color (variant),
 *  candado (pagada = fija), si admite arrastre (no pagada + source arrastrable)
 *  y un título humano para el hover. El bloqueo por semana cerrada lo aplica
 *  el padre (B5), que sí conoce el anchor. */
export interface CellChip {
  variant: PillVariant;
  locked: boolean;
  draggable: boolean;
  title: string;
}

export function cellChip(
  value: ProjectionRowItemValue,
  source: FinanceCashflowItemSource,
): CellChip {
  const status = value.cellStatus ?? "PROJECTED";
  const variant = pillVariantFor({
    cellStatus: status,
    daysOverdue: value.daysOverdue,
    factoringCollected: value.dtes?.some((d) => d.factoringCollected),
  });
  const locked = status === "PAID";
  const draggable = !locked && isDraggableSource(source);
  let title = VARIANT_TITLE[variant];
  if (variant === "OVERDUE" && value.daysOverdue) {
    title += ` · ${value.daysOverdue}d de mora`;
  }
  if (value.dteFolio) title += ` · N° ${value.dteFolio}`;
  return { variant, locked, draggable, title };
}
