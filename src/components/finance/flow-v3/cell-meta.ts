/**
 * Metadatos de capa / item comprometido compartidos entre PlanillaCell,
 * PlanillaFxBar y CellLayersPopover — una sola fuente de labels y tonos.
 */
import type { CommittedItem } from "@/modules/finance/flow-v3/types";
import type { FlowMatrixCellDto } from "@/modules/finance/flow-v3/matrix-types";
import { folioChip } from "./format";

export type CornerKind = "real" | "dte" | "warn" | null;

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

/** Marca de esquina: real > F°/programada (azul) > EP/B (ámbar); P sin marca. */
export function cornerKind(cell: FlowMatrixCellDto): CornerKind {
  if (cell.layer === "real") return "real";
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

/** Tag primario de la celda para fx bar / chip. */
export function primaryCellTag(cell: FlowMatrixCellDto): {
  tag: string;
  tone: "info" | "warn" | "ok" | "neutral";
  title: string;
} | null {
  if (cell.layer === "real") return { tag: "REAL", tone: "ok", title: "Conciliado" };
  if (cell.layer === "plan") return { tag: "Plan", tone: "neutral", title: "Plan manual" };
  if (cell.layer !== "committed") return null;
  const { hasDte, hasProforma, hasDraft, dteFolio } = committedPriority(cell);
  if (hasDte) {
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
