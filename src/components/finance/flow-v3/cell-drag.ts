/**
 * Drag de ítems en la planilla: plan, factura (F°), borrador (B) o programación (P).
 * B usa el mismo override de fecha que F° (dteId). Cada uno se mueve solo.
 * Proyecciones paramétricas (Retiro socios, etc.) sin template/hito usan `parametric`.
 */
import type { CommittedItem } from "@/modules/finance/flow-v3/types";
import type { FlowMatrixCellDto } from "@/modules/finance/flow-v3/matrix-types";
import { committedItemMeta } from "./cell-meta";
import { isParametricMoveRow } from "./parametric-move";

export type CellDragPayload =
  | { kind: "plan" }
  | { kind: "scheduled"; templateId: string; billingPeriod: string }
  | { kind: "milestone"; milestoneKey: string; billingPeriod: string }
  | { kind: "dte"; dteId: string }
  | { kind: "parametric"; amount: number };

/**
 * Destino válido para F° / B / P. Semana sellada no. En fila archivada
 * (`cerrada`) las celdas posteriores al cutoff se vacían en la matriz, así
 * que no se ofrece soltar ahí: hay que desarchivar para mover hacia adelante.
 */
export function canDropCommittedOnWeek(opts: {
  weekStart: string;
  weekClosed: boolean;
  rowArchived: boolean;
  archivedWeekCutoff: string | null;
}): boolean {
  if (opts.weekClosed) return false;
  if (
    opts.rowArchived &&
    opts.archivedWeekCutoff != null &&
    opts.weekStart > opts.archivedWeekCutoff
  ) {
    return false;
  }
  return true;
}

export type StackedLine = {
  key: string;
  tag: string;
  tone: "info" | "warn" | "ok";
  monto: number;
  title: string;
  drag: CellDragPayload | null;
};

export function itemDragPayload(it: CommittedItem, rowName?: string): CellDragPayload | null {
  if (it.kind === "scheduled" && it.templateId && it.billingPeriod) {
    return { kind: "scheduled", templateId: it.templateId, billingPeriod: it.billingPeriod };
  }
  if (it.kind === "scheduled" && it.milestoneKey && it.billingPeriod) {
    return { kind: "milestone", milestoneKey: it.milestoneKey, billingPeriod: it.billingPeriod };
  }
  if ((it.kind === "dte" || it.kind === "draft") && it.dteId) {
    return { kind: "dte", dteId: it.dteId };
  }
  if (
    it.kind === "scheduled" &&
    !it.templateId &&
    !it.milestoneKey &&
    rowName &&
    isParametricMoveRow(rowName) &&
    Number.isFinite(it.monto) &&
    it.monto !== 0
  ) {
    return { kind: "parametric", amount: it.monto };
  }
  return null;
}

/** Dos o más cobros en la misma casilla → una línea por ítem (CIMS F°+P). */
export function stackedCommittedLines(cell: FlowMatrixCellDto, rowName?: string): StackedLine[] {
  const items = cell.committed?.items ?? [];
  if (items.length < 2) return [];
  return items.map((it, i) => {
    const meta = committedItemMeta(it);
    return {
      key: `${it.kind}-${it.dteId ?? it.templateId ?? i}-${it.billingPeriod ?? it.folio ?? i}`,
      tag: meta.tag,
      tone: meta.tone,
      monto: it.monto,
      title: `${meta.title} · ${it.label}`,
      drag: itemDragPayload(it, rowName),
    };
  });
}

/**
 * Arrastre de la celda entera solo si hay un único destino inequívoco:
 * plan manual, o un solo F°/B/P. Si conviven, cada línea se arrastra sola.
 */
export function cellLevelDragPayload(
  cell: FlowMatrixCellDto,
  rowName?: string,
): CellDragPayload | null {
  if (cell.layer === "plan" && cell.plan !== 0) return { kind: "plan" };
  if (cell.layer !== "committed") return null;
  const items = cell.committed?.items ?? [];
  if (items.length === 1) return itemDragPayload(items[0]!, rowName);
  if (
    items.length === 0 &&
    rowName &&
    isParametricMoveRow(rowName) &&
    (cell.committed?.total ?? 0) !== 0
  ) {
    return { kind: "parametric", amount: cell.committed!.total };
  }
  return null;
}
