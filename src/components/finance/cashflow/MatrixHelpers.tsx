"use client";
import { ChevronDown, ChevronRight } from "lucide-react";
import type {
  CashflowCellStatus,
  ProjectionBucket,
  ProjectionRow,
  VirtualOccurrence,
} from "@/modules/finance/cashflow/types";
import { CellAmount } from "./CellAmount";
import { CellActionPopover } from "./CellActionPopover";
import { useDraggable, useDroppable } from "@dnd-kit/core";

export const fmt = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });

export type RowOrder = "default" | "alpha" | "amount_desc";

const ROW_ORDER_STORAGE_KEY = "cashflow.row.order";

export function loadRowOrder(): RowOrder {
  if (typeof window === "undefined") return "default";
  try {
    const v = window.localStorage.getItem(ROW_ORDER_STORAGE_KEY);
    if (v === "alpha" || v === "amount_desc") return v;
  } catch {
    /* localStorage no disponible */
  }
  return "default";
}

export function saveRowOrder(order: RowOrder): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ROW_ORDER_STORAGE_KEY, order);
  } catch {
    /* localStorage no disponible (modo privado, quota, etc.) */
  }
}

/**
 * Ordena las filas de la matriz dentro de un grupo (ingresos o egresos).
 * El orden por defecto (vienen ya ordenadas del server por kind+sortOrder+name)
 * no toca el arreglo. Alfabético usa `localeCompare` español. "amount_desc"
 * usa el total acumulado del row.
 */
export function sortRowsForDisplay(
  rows: ProjectionRow[],
  order: RowOrder,
): ProjectionRow[] {
  if (order === "default") return rows;
  const copy = [...rows];
  if (order === "alpha") {
    copy.sort((a, b) => a.categoryName.localeCompare(b.categoryName, "es"));
  } else if (order === "amount_desc") {
    copy.sort((a, b) => b.total - a.total);
  }
  return copy;
}

/**
 * Tono semántico para drift de caja:
 *  - |drift| < 50.000 → ok (cuadrado)
 *  - |drift| < 500.000 → info
 *  - resto → warn
 *  - null → muted (bucket futuro)
 */
export type DriftTone = "ok" | "info" | "warn" | "muted";

export function driftTone(drift: number | null): DriftTone {
  if (drift === null) return "muted";
  const abs = Math.abs(drift);
  if (abs < 50_000) return "ok";
  if (abs < 500_000) return "info";
  return "warn";
}

export const DRIFT_TONE_CLASS: Record<DriftTone, string> = {
  ok: "text-status-ok-fg",
  info: "text-status-info-fg",
  warn: "text-status-warn-fg",
  muted: "text-ds-text-4",
};

const STATUS_LABEL: Record<CashflowCellStatus, string | null> = {
  DRAFT: "Borrador",
  INVOICED: "Facturada",
  CEDED: "Cedida",
  PAID: "Pagada",
  VOIDED: "Anulada",
  PROJECTED: null,
};

const STATUS_CLASS: Record<CashflowCellStatus, string> = {
  DRAFT: "bg-status-warn-soft text-status-warn-fg",
  INVOICED: "bg-status-info-soft text-status-info-fg",
  CEDED:
    "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  PAID: "bg-status-ok-soft text-status-ok-fg",
  VOIDED: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300",
  PROJECTED: "",
};

/**
 * Badge textual de estado para list view móvil y drawer. En la matriz desktop
 * usamos un dot inline (ver CellAmount), pero en mobile el espacio horizontal
 * permite mostrar la etiqueta legible.
 */
export function StatusBadge({
  status,
  daysOverdue,
  size = "sm",
}: {
  status?: CashflowCellStatus;
  daysOverdue?: number;
  size?: "sm" | "md";
}) {
  if (!status || status === "PROJECTED") return null;
  const label = STATUS_LABEL[status];
  if (!label) return null;
  const overdueSuffix =
    status === "INVOICED" && daysOverdue && daysOverdue > 0
      ? ` · +${daysOverdue}d`
      : "";
  const sizeCls =
    size === "md"
      ? "text-[12px] px-2 py-0.5"
      : "text-[10px] px-1.5 py-0.5";
  return (
    <span
      className={`inline-flex items-center font-medium rounded-ds-sm ${sizeCls} ${STATUS_CLASS[status]}`}
    >
      {label}
      {overdueSuffix}
    </span>
  );
}

// ---------------------------------------------------------------------------
// DnD helper components
// ---------------------------------------------------------------------------

function DroppableBucketCell({
  bucketKey,
  children,
  className = "",
}: {
  bucketKey: string;
  children: React.ReactNode;
  className?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: bucketKey });
  return (
    <td
      ref={setNodeRef}
      className={`${className} ${isOver ? "bg-status-info-soft transition-colors" : ""}`}
    >
      {children}
    </td>
  );
}

function DraggableOccurrenceChip({
  occurrenceId,
  draggable,
  children,
}: {
  occurrenceId: string | null;
  /** false si la ocurrencia es PAID o no tiene id (virtual). */
  draggable: boolean;
  children: React.ReactNode;
}) {
  const dragId = occurrenceId ? `occ-${occurrenceId}` : "noop";
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: dragId,
    disabled: !draggable,
  });
  const style: React.CSSProperties = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    cursor: draggable ? (isDragging ? "grabbing" : "grab") : "default",
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <span
      ref={setNodeRef}
      style={style}
      {...(draggable ? listeners : {})}
      {...(draggable ? attributes : {})}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Helpers to find a representative draggable occurrence for a cell
// ---------------------------------------------------------------------------

/**
 * Given the full bucket list and the category/bucket coordinates, returns
 * the first occurrence that is materialized (has an id) and not PAID.
 * Returns null if none exists (cell is a pure aggregate / all conciliated).
 */
function findDraggableOccurrence(
  buckets: ProjectionBucket[],
  categoryId: string | null,
  bucketKey: string,
): VirtualOccurrence | null {
  const bucket = buckets.find((b) => b.key === bucketKey);
  if (!bucket) return null;
  return (
    bucket.occurrences.find(
      (o) =>
        (o.categoryId ?? "_") === (categoryId ?? "_") &&
        o.id !== null &&
        o.status !== "PAID",
    ) ?? null
  );
}

/**
 * Sticky positioning convention used across the matrix:
 *   - Left column (categoría): sticky left-0, z-20 in tbody, z-30 in thead/tfoot.
 *   - Right column (Total):    sticky right-0, z-20 in tbody, z-30 in thead/tfoot.
 *   - Bottom rows (subtotals, neto, saldo acumulado): sticky bottom-0
 *     with `bg-*` to cover content scrolled underneath.
 *   - Their corner cells (left+bottom or right+bottom) bump z-40 so they
 *     stay above adjacent sticky cells.
 */

export function MatrixRow({
  row,
  actualByCellKey,
  buckets,
  granularity,
  onActionDone,
}: {
  row: ProjectionRow;
  actualByCellKey?: Map<string, number>;
  /** When provided, cells become droppable and aggregate amounts become draggable. */
  buckets?: ProjectionBucket[];
  /** Required when buckets is set — drives popover semantics ("1 sem" en weekly, "1 mes" conceptual en monthly). */
  granularity?: "weekly" | "monthly";
  /** Callback tras una acción de mover/editar exitosa, para refrescar la matriz. */
  onActionDone?: () => void;
}) {
  return (
    <tr className="hover:bg-muted/20">
      <td className="sticky left-0 z-20 bg-background p-2 truncate min-w-[140px] max-w-[200px] sm:min-w-[180px] sm:max-w-[260px]">
        {row.categoryName}
      </td>
      {row.values.map((v) => {
        const cellKey = `${row.categoryId ?? "_"}_${v.bucketKey}`;
        const actual = actualByCellKey?.has(cellKey)
          ? (actualByCellKey.get(cellKey) ?? null)
          : null;
        const variance =
          actual !== null ? actual - v.amount : null;

        const cellContent = (
          <CellAmount
            projected={v.amount}
            actual={actual}
            variance={variance}
            kind={row.kind as "INCOME" | "EXPENSE"}
          />
        );

        if (buckets) {
          // Find the first moveable occurrence for this category+bucket
          const occ = findDraggableOccurrence(buckets, row.categoryId, v.bucketKey);
          const target =
            occ && occ.itemId
              ? {
                  id: occ.id,
                  itemId: occ.itemId,
                  originalDate: occ.scheduledDate.toISOString().slice(0, 10),
                  amountClp: occ.amountClp,
                }
              : null;
          return (
            <DroppableBucketCell
              key={v.bucketKey}
              bucketKey={v.bucketKey}
              className="p-2 text-right text-ds-text-2 whitespace-nowrap"
            >
              <DraggableOccurrenceChip
                occurrenceId={occ?.id ?? null}
                draggable={occ !== null}
              >
                <CellActionPopover
                  target={target}
                  granularity={granularity ?? "weekly"}
                  onActionDone={onActionDone ?? (() => {})}
                >
                  {cellContent}
                </CellActionPopover>
              </DraggableOccurrenceChip>
            </DroppableBucketCell>
          );
        }

        return (
          <td key={v.bucketKey} className="p-2 text-right text-ds-text-2 whitespace-nowrap">
            {cellContent}
          </td>
        );
      })}
      <td className="hidden sm:table-cell sticky right-0 z-20 p-2 text-right font-mono bg-card whitespace-nowrap border-l border-border/50">
        {fmt.format(row.total)}
      </td>
    </tr>
  );
}

export function SectionHeader({
  label,
  colSpan,
  tone,
  expanded,
  onToggle,
}: {
  label: string;
  colSpan: number;
  tone: "ok" | "warn";
  /** Si `onToggle` está definido, el header es clickeable con chevron. */
  expanded?: boolean;
  onToggle?: () => void;
}) {
  const cls =
    tone === "ok" ? "bg-status-ok-soft text-status-ok-fg" : "bg-status-warn-soft text-status-warn-fg";
  // No usamos `sticky left-0` en el <td> porque combinado con colSpan
  // hace que el background visible se reduzca al ancho de la primera
  // columna (las celdas de filas siguientes se ven a través del resto
  // de la fila). En vez de eso, el <td> cubre todas las columnas con
  // fondo opaco y solo el <span>/<button> con el label queda sticky-left
  // para mantenerse visible al hacer scroll horizontal.
  return (
    <tr className={cls}>
      <td
        colSpan={colSpan}
        className={`p-1.5 text-[11px] font-mono uppercase tracking-wider ${cls}`}
      >
        {onToggle ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            className="sticky left-2 inline-flex items-center gap-1.5 cursor-pointer"
            title={expanded ? `Colapsar ${label}` : `Expandir ${label}`}
          >
            {expanded ? (
              <ChevronDown className="h-3 w-3 shrink-0" />
            ) : (
              <ChevronRight className="h-3 w-3 shrink-0" />
            )}
            <span>{label}</span>
          </button>
        ) : (
          <span className="sticky left-2 inline-block">{label}</span>
        )}
      </td>
    </tr>
  );
}

export function SubtotalRow({
  label,
  rows,
  buckets,
  tone,
}: {
  label: string;
  rows: ProjectionRow[];
  buckets: ProjectionBucket[];
  tone: "ok" | "warn";
}) {
  const totals = buckets.map((b) =>
    rows.reduce((s, r) => s + (r.values.find((v) => v.bucketKey === b.key)?.amount ?? 0), 0),
  );
  const grand = totals.reduce((s, x) => s + x, 0);
  const cls = tone === "ok" ? "text-status-ok-fg" : "text-status-warn-fg";
  return (
    <tr className="border-t border-border font-medium bg-background">
      <td className="sticky left-0 z-20 bg-background p-2 whitespace-nowrap">{label}</td>
      {totals.map((t, i) => (
        <td key={i} className={`p-2 text-right font-mono whitespace-nowrap ${cls}`}>
          {fmt.format(t)}
        </td>
      ))}
      <td className={`hidden sm:table-cell sticky right-0 z-20 p-2 text-right font-mono bg-card whitespace-nowrap border-l border-border/50 ${cls}`}>
        {fmt.format(grand)}
      </td>
    </tr>
  );
}
