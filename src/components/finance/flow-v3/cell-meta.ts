/**
 * Metadatos de capa / item comprometido compartidos entre PlanillaCell,
 * PlanillaFxBar y CellLayersPopover — una sola fuente de labels y tonos.
 */
import type { CommittedItem } from "@/modules/finance/flow-v3/types";
import type { FlowMatrixCellDto } from "@/modules/finance/flow-v3/matrix-types";
import { folioChip } from "./format";

export type CornerKind = "real" | "dte" | "warn" | "plan" | null;

export const LAYER_LABEL = {
  real: "REAL",
  committed: "Comprometido",
  plan: "Plan",
  empty: "Sin dato",
} as const;

/** Prioridad de sub-capa comprometida alineada con PlanillaCell. */
export function committedPriority(cell: FlowMatrixCellDto): {
  hasDte: boolean;
  hasProforma: boolean;
  hasDraft: boolean;
  dteFolio?: number;
} {
  const items = cell.committed?.items ?? [];
  const hasDte = items.some((i) => i.kind === "dte");
  const hasProforma = items.some((i) => i.kind === "draft" && i.proformaSent);
  const hasDraft = items.some((i) => i.kind === "draft" && !i.proformaSent);
  const dteFolio = hasDte ? items.find((i) => i.folio)?.folio : undefined;
  return { hasDte, hasProforma, hasDraft, dteFolio };
}

/** Marca de esquina: real > F° > EP/B > plan manual; P programada sin marca. */
export function cornerKind(cell: FlowMatrixCellDto): CornerKind {
  if (cell.layer === "real") return "real";
  if (cell.layer === "plan" && cell.plan !== 0) return "plan";
  if (cell.layer !== "committed") return null;
  const { hasDte, hasProforma, hasDraft } = committedPriority(cell);
  if (hasDte) return "dte";
  if (hasProforma || hasDraft) return "warn";
  return null; // programada (P): sin marca
}

export function committedItemMeta(it: CommittedItem): {
  tag: string;
  label: string;
  tone: "info" | "warn" | "ok";
  title: string;
} {
  if (it.kind === "dte") {
    const folio = it.folio != null ? folioChip(it.folio) : { text: "F°", title: "Factura emitida" };
    return { tag: folio.text, label: it.label, tone: "info", title: folio.title };
  }
  if (it.kind === "draft") {
    return it.proformaSent
      ? { tag: "EP", label: it.label, tone: "warn", title: "EP enviado" }
      : { tag: "B", label: it.label, tone: "warn", title: "Borrador" };
  }
  return { tag: "P", label: it.label, tone: "info", title: "Programada" };
}

/** Cantidad de DTEs emitidos en la celda. */
export function dteCountInCell(cell: FlowMatrixCellDto): number {
  return (cell.committed?.items ?? []).filter((i) => i.kind === "dte").length;
}

/** Folios de DTEs de la celda (para tooltip ×N). */
export function dteFoliosInCell(cell: FlowMatrixCellDto): number[] {
  return (cell.committed?.items ?? [])
    .filter((i): i is typeof i & { folio: number } => i.kind === "dte" && i.folio != null)
    .map((i) => i.folio);
}

/** Pendiente de F° en semana pasada (no suma a effective; solo informativo). */
export function pastPendingDteMeta(cell: FlowMatrixCellDto, isPast: boolean): {
  count: number;
  total: number;
  tag: string;
  title: string;
} | null {
  if (!isPast) return null;
  const items = (cell.committed?.items ?? []).filter((i) => i.kind === "dte");
  if (items.length === 0) return null;
  const total = items.reduce((s, i) => s + i.monto, 0);
  const folios = items
    .filter((i): i is typeof i & { folio: number } => i.folio != null)
    .map((i) => i.folio);
  const title = folios.length
    ? `Pendiente: ${folios.map((f) => `F°${f}`).join(", ")}`
    : `${items.length} factura${items.length === 1 ? "" : "s"} pendiente${items.length === 1 ? "" : "s"}`;
  const tag =
    items.length >= 2
      ? `×${items.length}`
      : items[0]?.folio != null
        ? folioChip(items[0].folio).text
        : "F°";
  return { count: items.length, total, tag, title };
}

/** Tag primario de la celda para fx bar / chip. */
export function primaryCellTag(
  cell: FlowMatrixCellDto,
  opts?: { isPast?: boolean },
): {
  tag: string;
  tone: "info" | "warn" | "ok" | "neutral";
  title: string;
} | null {
  const isPast = opts?.isPast === true;
  // Semana pasada con real: el tag REAL manda; el badge "+F° pend." va aparte.
  if (cell.layer === "real") return { tag: "REAL", tone: "ok", title: "Conciliado" };
  if (cell.layer === "plan") return { tag: "Plan", tone: "neutral", title: "Plan manual" };
  // Pasado sin real pero con F° pendiente anclada → chip atenuado (informativo).
  if (isPast && cell.layer === "empty") {
    const pend = pastPendingDteMeta(cell, true);
    if (pend) return { tag: pend.tag, tone: "info", title: pend.title };
    return null;
  }
  if (cell.layer !== "committed") return null;
  const { hasDte, hasProforma, hasDraft, dteFolio } = committedPriority(cell);
  if (hasDte) {
    const n = dteCountInCell(cell);
    if (n >= 2) {
      const folios = dteFoliosInCell(cell);
      const folioTxt = folios.length
        ? folios.map((f) => `F°${f}`).join(", ")
        : `${n} facturas`;
      return { tag: `×${n}`, tone: "info", title: folioTxt };
    }
    const f = dteFolio != null ? folioChip(dteFolio) : { text: "F°", title: "Factura emitida" };
    return { tag: f.text, tone: "info", title: f.title };
  }
  if (hasProforma) return { tag: "EP", tone: "warn", title: "EP enviado" };
  if (hasDraft) return { tag: "B", tone: "warn", title: "Borrador" };
  return { tag: "P", tone: "info", title: "Programada" };
}

export function toneClass(tone: "info" | "warn" | "ok" | "neutral"): string {
  if (tone === "ok") return "text-status-ok-fg";
  if (tone === "warn") return "text-status-warn-fg";
  if (tone === "info") return "text-status-info-fg";
  return "text-ds-text-3";
}
