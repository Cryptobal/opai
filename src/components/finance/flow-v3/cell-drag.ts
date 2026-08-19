/**
 * Drag de ítems en la planilla: plan manual, factura (F°) o programación (P).
 * Cada uno se mueve solo. No fija la fecha de emisión del template.
 */
import type { CommittedItem } from "@/modules/finance/flow-v3/types";
import type { FlowMatrixCellDto } from "@/modules/finance/flow-v3/matrix-types";
import { committedItemMeta } from "./cell-meta";

export type CellDragPayload =
  | { kind: "plan" }
  | { kind: "scheduled"; templateId: string; billingPeriod: string }
  | { kind: "milestone"; milestoneKey: string; billingPeriod: string }
  | { kind: "dte"; dteId: string };

export type StackedLine = {
  key: string;
  tag: string;
  tone: "info" | "warn" | "ok";
  monto: number;
  title: string;
  drag: CellDragPayload | null;
};

export function itemDragPayload(it: CommittedItem): CellDragPayload | null {
  if (it.kind === "scheduled" && it.templateId && it.billingPeriod) {
    return { kind: "scheduled", templateId: it.templateId, billingPeriod: it.billingPeriod };
  }
  if (it.kind === "scheduled" && it.milestoneKey && it.billingPeriod) {
    return { kind: "milestone", milestoneKey: it.milestoneKey, billingPeriod: it.billingPeriod };
  }
  if (it.kind === "dte" && it.dteId) {
    return { kind: "dte", dteId: it.dteId };
  }
  return null;
}

/** Dos o más cobros en la misma casilla → una línea por ítem (CIMS F°+P). */
export function stackedCommittedLines(cell: FlowMatrixCellDto): StackedLine[] {
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
      drag: itemDragPayload(it),
    };
  });
}

/**
 * Arrastre de la celda entera solo si hay un único destino inequívoco:
 * plan manual, o un solo F°/P. Si conviven, cada línea se arrastra sola.
 */
export function cellLevelDragPayload(cell: FlowMatrixCellDto): CellDragPayload | null {
  if (cell.layer === "plan" && cell.plan !== 0) return { kind: "plan" };
  if (cell.layer !== "committed") return null;
  const items = cell.committed?.items ?? [];
  if (items.length !== 1) return null;
  return itemDragPayload(items[0]!);
}
