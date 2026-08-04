/**
 * Metadatos de capa / item comprometido compartidos entre PlanillaCell,
 * PlanillaFxBar y CellLayersPopover — una sola fuente de labels y tonos.
 */
import type { CommittedItem, SentDocs } from "@/modules/finance/flow-v3/types";
import type { FlowMatrixCellDto } from "@/modules/finance/flow-v3/matrix-types";
import { folioChip } from "./format";

export type CornerKind = "real" | "dte" | "warn" | "plan" | null;

/** Marca secundaria inf-der: cedida / docs de cobro enviados. */
export type SecondaryMark = "ceded" | "proforma" | "estadoPago";

export const LAYER_LABEL = {
  real: "REAL",
  committed: "Comprometido",
  plan: "Plan",
  empty: "Sin dato",
} as const;

function draftSentDocs(it: CommittedItem): SentDocs {
  return {
    proforma: it.sentDocs?.proforma === true,
    estadoPago: it.sentDocs?.estadoPago === true,
  };
}

/** Etiqueta corta fiel: EP / Proforma / EP+Prof. / B. */
export function draftTag(sent: SentDocs): { tag: string; title: string } {
  if (sent.estadoPago && sent.proforma) {
    return { tag: "EP+Prof.", title: "EP + Proforma enviados" };
  }
  if (sent.estadoPago) return { tag: "EP", title: "EP enviado" };
  if (sent.proforma) return { tag: "Proforma", title: "Proforma enviada" };
  return { tag: "B", title: "Borrador" };
}

/** Prefijo de grupo en menú/sheet: "EP {cliente}" / … */
export function draftGroupLabel(sent: SentDocs, clientName: string): string {
  const name = clientName.trim() || "cliente";
  if (sent.estadoPago && sent.proforma) return `EP+Proforma ${name}`;
  if (sent.estadoPago) return `EP ${name}`;
  if (sent.proforma) return `Proforma ${name}`;
  return `Borrador ${name}`;
}

/** Prioridad de sub-capa comprometida alineada con PlanillaCell. */
export function committedPriority(cell: FlowMatrixCellDto): {
  hasDte: boolean;
  hasSentDoc: boolean;
  hasDraft: boolean;
  dteFolio?: number;
} {
  const items = cell.committed?.items ?? [];
  const hasDte = items.some((i) => i.kind === "dte");
  const hasSentDoc = items.some((i) => {
    if (i.kind !== "draft") return false;
    const s = draftSentDocs(i);
    return s.proforma || s.estadoPago;
  });
  const hasDraft = items.some((i) => {
    if (i.kind !== "draft") return false;
    const s = draftSentDocs(i);
    return !s.proforma && !s.estadoPago;
  });
  const dteFolio = hasDte ? items.find((i) => i.folio)?.folio : undefined;
  return { hasDte, hasSentDoc, hasDraft, dteFolio };
}

/** Marca de esquina: real > F° > EP/B > plan manual; P programada sin marca. */
export function cornerKind(cell: FlowMatrixCellDto): CornerKind {
  if (cell.layer === "real") return "real";
  if (cell.layer === "plan" && cell.plan !== 0) return "plan";
  if (cell.layer !== "committed") return null;
  const { hasDte, hasSentDoc, hasDraft } = committedPriority(cell);
  if (hasDte) return "dte";
  if (hasSentDoc || hasDraft) return "warn";
  return null; // programada (P): sin marca
}

/**
 * Marcas inf-der (no reemplazan la esquina superior):
 *  - cedida: factura emitida (o real conciliado de una cedida)
 *  - estadoPago / proforma: borrador con doc de cobro enviado
 * Cedida tiene prioridad sobre docs de borrador si coexisten.
 */
export function secondaryMarks(cell: FlowMatrixCellDto): SecondaryMark[] {
  const cededCommitted = (cell.committed?.items ?? []).some(
    (i) => i.kind === "dte" && i.ceded === true,
  );
  const cededReal = (cell.real?.items ?? []).some((i) => i.ceded === true);
  if (cededCommitted || cededReal) return ["ceded"];

  const drafts = (cell.committed?.items ?? []).filter((i) => i.kind === "draft");
  if (drafts.length === 0) return [];
  const marks: SecondaryMark[] = [];
  if (drafts.some((i) => draftSentDocs(i).estadoPago)) marks.push("estadoPago");
  if (drafts.some((i) => draftSentDocs(i).proforma)) marks.push("proforma");
  return marks;
}

export function secondaryMarkTitle(marks: SecondaryMark[]): string | null {
  if (marks.length === 0) return null;
  const parts: string[] = [];
  if (marks.includes("ceded")) parts.push("Cedida a factoring");
  if (marks.includes("estadoPago")) parts.push("EP enviado");
  if (marks.includes("proforma")) parts.push("Proforma enviada");
  return parts.join(" · ");
}

export function committedItemMeta(it: CommittedItem): {
  tag: string;
  label: string;
  tone: "info" | "warn" | "ok";
  title: string;
} {
  if (it.kind === "dte") {
    const folio = it.folio != null ? folioChip(it.folio) : { text: "F°", title: "Factura emitida" };
    const title = it.ceded ? `${folio.title} · Cedida` : folio.title;
    return { tag: folio.text, label: it.label, tone: "info", title };
  }
  if (it.kind === "draft") {
    const { tag, title } = draftTag(draftSentDocs(it));
    return { tag, label: it.label, tone: "warn", title };
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
  const { hasDte, hasSentDoc, hasDraft, dteFolio } = committedPriority(cell);
  if (hasDte) {
    const n = dteCountInCell(cell);
    const anyCeded = (cell.committed?.items ?? []).some(
      (i) => i.kind === "dte" && i.ceded === true,
    );
    if (n >= 2) {
      const folios = dteFoliosInCell(cell);
      const folioTxt = folios.length
        ? folios.map((f) => `F°${f}`).join(", ")
        : `${n} facturas`;
      return {
        tag: `×${n}`,
        tone: "info",
        title: anyCeded ? `${folioTxt} · Cedida` : folioTxt,
      };
    }
    const f = dteFolio != null ? folioChip(dteFolio) : { text: "F°", title: "Factura emitida" };
    return {
      tag: f.text,
      tone: "info",
      title: anyCeded ? `${f.title} · Cedida` : f.title,
    };
  }
  if (hasSentDoc || hasDraft) {
    const draft = (cell.committed?.items ?? []).find((i) => i.kind === "draft");
    if (draft) {
      const meta = draftTag(draftSentDocs(draft));
      return { tag: meta.tag, tone: "warn", title: meta.title };
    }
  }
  return { tag: "P", tone: "info", title: "Programada" };
}

export function toneClass(tone: "info" | "warn" | "ok" | "neutral"): string {
  if (tone === "ok") return "text-status-ok-fg";
  if (tone === "warn") return "text-status-warn-fg";
  if (tone === "info") return "text-status-info-fg";
  return "text-ds-text-3";
}

/** Línea "Emite dd/mm · término N d → cobro est. dd/mm" solo si hay término > 0. */
export function terminoStatusLine(
  it: Pick<CommittedItem, "issueYmd" | "fecha" | "terminoDias" | "cobroEstYmd">,
  fmt: (ymd: string) => string,
): string {
  const issue = it.issueYmd ?? it.fecha;
  const parts: string[] = [];
  if (issue) parts.push(`Emite ${fmt(issue)}`);
  if (it.terminoDias != null && it.terminoDias > 0 && it.cobroEstYmd) {
    parts.push(`término ${it.terminoDias} d → cobro est. ${fmt(it.cobroEstYmd)}`);
  }
  return parts.join(" · ");
}
