/**
 * Metadatos de capa / item comprometido compartidos entre PlanillaCell,
 * PlanillaFxBar y CellLayersPopover — una sola fuente de labels y tonos.
 */
import type { CommittedItem, SentDocs } from "@/modules/finance/flow-v3/types";
import type { FlowMatrixCellDto, FlowMatrixRowDto } from "@/modules/finance/flow-v3/matrix-types";
import { folioChip } from "./format";

export type CornerKind = "real" | "dte" | "warn" | "plan" | null;

/** Mora contractual en celdas con DTE emitido impago. */
export type CellOverdueState = "none" | "overdue" | "overdue60";

/** Estado de cesión agregado de la celda. */
export type CellCededState = "none" | "ceded" | "funded";

/** Chip de estado accionable / informativo en fila o ficha. */
export type CellStateChipKind =
  | "ceded"
  | "funded"
  | "retention"
  | "overdue"
  | "due";

export type CellStateChipTone = "info" | "ok" | "warn" | "danger" | "neutral";

export interface CellStateChip {
  kind: CellStateChipKind;
  label: string;
  tone: CellStateChipTone;
  dteId?: string;
  /** Días de mora (solo kind=overdue). */
  overdueDays?: number;
  crmAccountId?: string | null;
}

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

/** Estado de mora agregado de la celda (peor caso entre DTEs). */
export function cellOverdueState(cell: FlowMatrixCellDto): CellOverdueState {
  const dtes = (cell.committed?.items ?? []).filter((i) => i.kind === "dte");
  if (dtes.length === 0) return "none";
  if (dtes.some((i) => i.overdueOver60 === true)) return "overdue60";
  if (dtes.some((i) => (i.overdueDays ?? 0) > 0)) return "overdue";
  return "none";
}

/** Cantidad de DTEs con mora >0 en la celda. */
export function countOverdueInCell(cell: FlowMatrixCellDto): number {
  return (cell.committed?.items ?? []).filter(
    (i) => i.kind === "dte" && (i.overdueDays ?? 0) > 0,
  ).length;
}

/** ¿La fila tiene al menos un DTE vencido en alguna celda? */
export function rowHasOverdue(row: Pick<FlowMatrixRowDto, "cells">): boolean {
  return row.cells.some((c) => cellOverdueState(c) !== "none");
}

/** Total de DTEs vencidos en la fila (deduplicados por dteId). */
export function countOverdueInRow(row: Pick<FlowMatrixRowDto, "cells">): number {
  const ids = new Set<string>();
  for (const cell of row.cells) {
    for (const it of cell.committed?.items ?? []) {
      if (it.kind === "dte" && (it.overdueDays ?? 0) > 0 && it.dteId) {
        ids.add(it.dteId);
      }
    }
  }
  return ids.size;
}

/** Total de DTEs vencidos en la matriz (deduplicados por dteId). */
export function countOverdueInMatrix(rows: Pick<FlowMatrixRowDto, "cells">[]): number {
  const ids = new Set<string>();
  for (const row of rows) {
    for (const cell of row.cells) {
      for (const it of cell.committed?.items ?? []) {
        if (it.kind === "dte" && (it.overdueDays ?? 0) > 0 && it.dteId) {
          ids.add(it.dteId);
        }
      }
    }
  }
  return ids.size;
}

function itemIsCeded(it: CommittedItem): boolean {
  return it.kind === "dte" && ((it.cededPct ?? 0) > 0 || it.ceded === true);
}

/** Estado de cesión agregado de la celda (funded > ceded > none). */
export function cellCededState(cell: FlowMatrixCellDto): CellCededState {
  const dtes = (cell.committed?.items ?? []).filter((i) => i.kind === "dte");
  if (dtes.some((i) => itemIsCeded(i) && i.factoringFunded === true)) {
    return "funded";
  }
  if (dtes.some((i) => itemIsCeded(i))) return "ceded";
  return "none";
}

/** ¿La fila tiene al menos un DTE cedido? */
export function rowHasCeded(row: Pick<FlowMatrixRowDto, "cells">): boolean {
  return row.cells.some((c) => cellCededState(c) !== "none");
}

/** Total de DTEs cedidos en la fila (deduplicados por dteId). */
export function countCededInRow(row: Pick<FlowMatrixRowDto, "cells">): number {
  const ids = new Set<string>();
  for (const cell of row.cells) {
    for (const it of cell.committed?.items ?? []) {
      if (itemIsCeded(it) && it.dteId) ids.add(it.dteId);
    }
  }
  return ids.size;
}

/** Total de DTEs cedidos en la matriz (deduplicados por dteId). */
export function countCededInMatrix(rows: Pick<FlowMatrixRowDto, "cells">[]): number {
  const ids = new Set<string>();
  for (const row of rows) {
    for (const cell of row.cells) {
      for (const it of cell.committed?.items ?? []) {
        if (itemIsCeded(it) && it.dteId) ids.add(it.dteId);
      }
    }
  }
  return ids.size;
}

function fmtChipDate(ymd: string | undefined | null): string {
  if (!ymd || ymd.length < 10) return "—";
  const [, m, d] = ymd.split("-");
  return `${d}/${m}`;
}

/**
 * Chips de estado por celda (tabla §5 del brief mora/cesión).
 * Orden: cesión/retención/anticipo primero; mora o vence después.
 */
export function cellStateChips(cell: FlowMatrixCellDto): CellStateChip[] {
  const chips: CellStateChip[] = [];
  const seen = new Set<string>();
  for (const it of cell.committed?.items ?? []) {
    if (it.kind !== "dte") continue;
    const key = it.dteId ?? `${it.folio}-${it.fecha}`;
    if (seen.has(key)) continue;
    seen.add(key);

    if (it.isCededRetention) {
      chips.push({
        kind: "retention",
        label: `retención · liquida ${fmtChipDate(it.cesionDueYmd)}`,
        tone: "neutral",
        dteId: it.dteId,
      });
      continue;
    }
    if (itemIsCeded(it)) {
      if (it.factoringFunded) {
        chips.push({
          kind: "funded",
          label: "anticipo en banco",
          tone: "ok",
          dteId: it.dteId,
        });
      } else {
        const pct = it.cededPct && it.cededPct > 0 ? it.cededPct : 100;
        chips.push({
          kind: "ceded",
          label: `cedida ${pct}%`,
          tone: "info",
          dteId: it.dteId,
        });
      }
      continue;
    }
    const overdue = it.overdueDays ?? 0;
    if (overdue > 0) {
      chips.push({
        kind: "overdue",
        label: `mora ${overdue} d`,
        tone: overdue > 60 ? "danger" : "warn",
        dteId: it.dteId,
        overdueDays: overdue,
        crmAccountId: it.crmAccountId ?? null,
      });
    } else if (it.dueYmd) {
      chips.push({
        kind: "due",
        label: `vence ${fmtChipDate(it.dueYmd)}`,
        tone: "neutral",
        dteId: it.dteId,
      });
    }
  }
  return chips;
}

/**
 * Chips agregados de toda la fila (dedupe por dteId + kind).
 * Incluye cesión/fondeo para consumidores que los filtren; la columna
 * Concepto de la planilla no los muestra (marca secundaria en la celda).
 */
export function rowStateChips(row: Pick<FlowMatrixRowDto, "cells" | "name" | "crmAccountId">): CellStateChip[] {
  const byKey = new Map<string, CellStateChip>();
  for (const cell of row.cells) {
    for (const chip of cellStateChips(cell)) {
      const key = `${chip.kind}:${chip.dteId ?? chip.label}`;
      const prev = byKey.get(key);
      if (!prev) {
        byKey.set(key, {
          ...chip,
          crmAccountId: chip.crmAccountId ?? row.crmAccountId ?? null,
        });
        continue;
      }
      // Conservar la peor mora si hay duplicados.
      if (
        chip.kind === "overdue" &&
        (chip.overdueDays ?? 0) > (prev.overdueDays ?? 0)
      ) {
        byKey.set(key, {
          ...chip,
          crmAccountId: chip.crmAccountId ?? row.crmAccountId ?? null,
        });
      }
    }
  }
  const order: CellStateChipKind[] = [
    "ceded",
    "funded",
    "retention",
    "overdue",
    "due",
  ];
  return [...byKey.values()].sort(
    (a, b) => order.indexOf(a.kind) - order.indexOf(b.kind),
  );
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
  const cededCommitted = (cell.committed?.items ?? []).some((i) => itemIsCeded(i));
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

export type PastPendingMeta = {
  count: number;
  total: number;
  tag: string;
  title: string;
  /** Origen del fantasma en semana pasada (no suma a effective). */
  kind: "dte" | "committed" | "plan";
};

/** Pendiente de F° en semana pasada (no suma a effective; solo informativo). */
export function pastPendingDteMeta(
  cell: FlowMatrixCellDto,
  isPast: boolean,
): PastPendingMeta | null {
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
  return { count: items.length, total, tag, title, kind: "dte" };
}

/**
 * Fantasma informativo en semana pasada cuando aún no hay real:
 * F° pendiente, compromiso (sueldos/programado/borrador) o plan manual.
 * Nunca suma a `effective` (el flujo pasado solo consolida conciliaciones).
 */
export function pastPendingGhostMeta(
  cell: FlowMatrixCellDto,
  isPast: boolean,
): PastPendingMeta | null {
  if (!isPast) return null;

  // Con real: solo el badge mixto de F° pendientes (igual que antes).
  if (cell.layer === "real") {
    return pastPendingDteMeta(cell, true);
  }
  if (cell.layer !== "empty") return null;

  const dtePend = pastPendingDteMeta(cell, true);
  if (dtePend) return dtePend;

  const committed = cell.committed;
  if (committed && committed.total !== 0) {
    const items = committed.items ?? [];
    const first = items[0];
    if (first?.kind === "draft") {
      const meta = draftTag(draftSentDocs(first));
      return {
        count: Math.max(1, items.length),
        total: committed.total,
        tag: meta.tag,
        title: `${meta.title} · pendiente (no suma al flujo)`,
        kind: "committed",
      };
    }
    const label = first?.label?.trim();
    return {
      count: Math.max(1, items.length),
      total: committed.total,
      tag: "P",
      title: label
        ? `${label} · pendiente (no suma al flujo)`
        : "Programado pendiente (no suma al flujo)",
      kind: "committed",
    };
  }

  if (cell.plan !== 0) {
    return {
      count: 1,
      total: Math.abs(cell.plan),
      tag: "Plan",
      title: "Plan manual pendiente (no suma al flujo)",
      kind: "plan",
    };
  }

  return null;
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
  // Pasado sin real pero con pendiente (F° / programado / plan) → chip atenuado.
  if (isPast && cell.layer === "empty") {
    const pend = pastPendingGhostMeta(cell, true);
    if (pend) {
      return {
        tag: pend.tag,
        tone: pend.kind === "plan" ? "neutral" : "info",
        title: pend.title,
      };
    }
    return null;
  }
  if (cell.layer !== "committed") return null;
  const { hasDte, hasSentDoc, hasDraft, dteFolio } = committedPriority(cell);
  if (hasDte) {
    const n = dteCountInCell(cell);
    const overdue = cellOverdueState(cell);
    const anyCeded = (cell.committed?.items ?? []).some(
      (i) => i.kind === "dte" && i.ceded === true,
    );
    if (n >= 2) {
      const folios = dteFoliosInCell(cell);
      const folioTxt = folios.length
        ? folios.map((f) => `F°${f}`).join(", ")
        : `${n} facturas`;
      const moraHint =
        overdue === "overdue60"
          ? " · mora +60d"
          : overdue === "overdue"
            ? " · en mora"
            : "";
      return {
        tag: `×${n}`,
        tone: overdue === "none" ? "info" : "warn",
        title: (anyCeded ? `${folioTxt} · Cedida` : folioTxt) + moraHint,
      };
    }
    const f = dteFolio != null ? folioChip(dteFolio) : { text: "F°", title: "Factura emitida" };
    const moraHint =
      overdue === "overdue60"
        ? " · mora +60d"
        : overdue === "overdue"
          ? " · en mora"
          : "";
    return {
      tag: f.text,
      tone: overdue === "none" ? "info" : "warn",
      title: (anyCeded ? `${f.title} · Cedida` : f.title) + moraHint,
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

export interface ExecutionMeta {
  state: "partial" | "complete" | "over" | "closed" | "none";
  /** Ancho de barra 0–100. */
  pctWidth: number;
  /** % de ejecución para chip/tooltip (null si no aplica). */
  pct: number | null;
  residual: number;
  over: number;
  title: string;
  showBar: boolean;
}

/** Metadatos de barra / tooltip de ejecución parcial. */
export function executionMeta(cell: FlowMatrixCellDto): ExecutionMeta | null {
  const ex = cell.execution;
  if (!ex || ex.state === "none") return null;
  const pct = ex.pct;
  const pctWidth =
    pct == null ? 0 : Math.min(100, Math.max(0, Math.round(pct)));
  const fmt = (n: number) =>
    `$${Math.round(Math.abs(n)).toLocaleString("es-CL")}`;
  let title = "";
  if (ex.state === "partial") {
    const pctTxt = pct == null ? "" : `${Math.round(pct)}% ejecutado`;
    title = `${pctTxt} · faltan ${fmt(ex.residual)}`.replace(/^ · /, "");
  } else if (ex.state === "over") {
    title = `${fmt(ex.over)} sobre lo proyectado`;
  } else if (ex.state === "closed") {
    title = "Proyección dada por cumplida";
  } else if (ex.state === "complete") {
    title = "100% ejecutado";
  }
  return {
    state: ex.state,
    pctWidth,
    pct,
    residual: ex.residual,
    over: ex.over,
    title,
    showBar: ex.state === "partial" || ex.state === "over",
  };
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
