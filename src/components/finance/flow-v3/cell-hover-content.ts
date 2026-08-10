/**
 * Contenido puro de la ficha de detalle (clic) — testeable sin DOM.
 */
import type { FlowMatrixCellDto, FlowMatrixRowDto } from "@/modules/finance/flow-v3/matrix-types";
import { hasManualPlanOverride } from "@/modules/finance/flow-v3/cell-editability";
import { weekLabel } from "@/modules/finance/flow-v3/weeks";
import { fmtClp, fmtDayMonth, fmtShortDate } from "./format";
import {
  committedItemMeta, LAYER_LABEL, pastPendingGhostMeta, terminoStatusLine,
} from "./cell-meta";
import {
  resolveCellColorMeaning,
  type ColorMeaningItem,
} from "./cell-color-meaning";
import { columnLetter } from "./column-letter";
import { displayValue } from "./grid-classes";

export interface HoverLine {
  label: string;
  value: string;
  emphasize?: boolean;
  muted?: boolean;
}

export interface HoverItemLine {
  tag: string;
  label: string;
  status: string;
  amount: string;
  /** Si hay DTE, la fila es clickeable → abre modal de factura. */
  dteId?: string;
}

export interface HoverDrift {
  projected: string;
  real: string;
  delta: string;
  pct: string | null;
  positive: boolean;
}

export interface HoverExecution {
  projected: string;
  real: string;
  /** "Por ejecutar X" o "Sobre proyección +X". */
  pendingLabel: string;
  pendingValue: string;
  pctLabel: string | null;
  state: "partial" | "complete" | "over" | "closed" | "none";
}

export interface HoverTermInfo {
  dueYmd: string;
  days: number | null;
  source: "explicit" | "contrato" | "tenant" | "default";
  label: string;
  editable: boolean;
}

export interface HoverCessionInfo {
  pct: number;
  factorName: string | null;
  funded: boolean;
  dueYmd: string | null;
  isRetention: boolean;
}

export interface HoverCobranzaTarget {
  dteId: string;
  crmAccountId: string | null;
  daysOverdue: number;
}

export interface HoverCardModel {
  concept: string;
  ref: string;
  weekLabel: string;
  /** Cabecera derecha: p.ej. "S33 · cobrado 10/08" (sin coordenada Excel). */
  subtitle: string;
  layerLabel: string;
  badges: string[];
  /** Significado de las marcas de color de esta celda (aprendizaje). */
  colorMeaning: ColorMeaningItem | null;
  lines: HoverLine[];
  items: HoverItemLine[];
  /** Preferido sobre `drift` cuando la celda trae execution. */
  execution: HoverExecution | null;
  drift: HoverDrift | null;
  pastPending: string | null;
  note: string | null;
  footerHint: string;
  /** Término de pago del primer DTE de la celda (ficha). */
  term: HoverTermInfo | null;
  cession: HoverCessionInfo | null;
  /** Target de cobranza si hay mora accionable. */
  cobranza: HoverCobranzaTarget | null;
}

function termSourceLabel(
  source: "explicit" | "contrato" | "tenant" | "default" | undefined,
): string {
  switch (source) {
    case "contrato":
      return "contrato";
    case "tenant":
      return "default tenant";
    case "explicit":
      return "explícito";
    default:
      return "default";
  }
}

function itemStatus(it: Parameters<typeof committedItemMeta>[0]): string {
  if (it.kind === "dte") {
    const parts: string[] = [];
    if (it.emissionYmd) parts.push(fmtShortDate(it.emissionYmd));
    else parts.push(fmtShortDate(it.fecha));
    if (it.dueYmd) parts.push(`vence ${fmtShortDate(it.dueYmd)}`);
    if (it.isCededRetention) {
      parts.push(
        it.cesionDueYmd
          ? `retención · liquida ${fmtShortDate(it.cesionDueYmd)}`
          : "retención",
      );
    } else if ((it.cededPct ?? 0) > 0 || it.ceded) {
      if (it.factoringFunded) parts.push("anticipo en banco");
      else parts.push(`cedida ${it.cededPct && it.cededPct > 0 ? it.cededPct : 100}%`);
    } else if ((it.overdueDays ?? 0) > 0) {
      parts.push(`mora ${it.overdueDays} d`);
    }
    return parts.join(" · ");
  }
  return terminoStatusLine(it, fmtShortDate) || fmtShortDate(it.fecha);
}

export function buildHoverCardContent(args: {
  row: FlowMatrixRowDto;
  cell: FlowMatrixCellDto;
  colIdx: number;
  rowNumber?: number;
  isPast?: boolean;
  reason?: string;
}): HoverCardModel {
  const { row, cell, colIdx } = args;
  const manual = hasManualPlanOverride(cell.plan, cell.layer);
  const badges: string[] = [LAYER_LABEL[cell.layer] ?? cell.layer];
  if (manual) badges.push("manual");

  const lines: HoverLine[] = [];
  const items: HoverItemLine[] = [];
  let drift: HoverDrift | null = null;

  if (cell.layer === "plan" || manual) {
    const v = displayValue(row.section, "plan", cell.plan);
    if (cell.plan !== 0 || manual) {
      lines.push({ label: "Plan", value: fmtClp(v), emphasize: cell.layer === "plan" });
    }
    if (manual && cell.committed && cell.committed.total !== 0) {
      lines.push({
        label: "Proyección",
        value: fmtClp(displayValue(row.section, "committed", cell.committed.total)),
        muted: true,
      });
    }
  }

  if (cell.layer === "committed") {
    const total = cell.committed?.total ?? 0;
    lines.push({
      label: "Comprometido",
      value: fmtClp(displayValue(row.section, "committed", total)),
      emphasize: true,
    });
    for (const it of cell.committed?.items ?? []) {
      const meta = committedItemMeta(it);
      items.push({
        tag: meta.tag,
        label: it.label,
        status: itemStatus(it),
        amount: fmtClp(it.monto),
        dteId: it.dteId,
      });
    }
  }

  if (cell.layer === "real") {
    const total = cell.real?.total ?? 0;
    lines.push({ label: "Real", value: fmtClp(Math.abs(total)), emphasize: true });
    for (const it of cell.real?.items ?? []) {
      items.push({
        tag: it.folio != null ? `F°${it.folio}` : "Pago",
        label: it.label,
        status: fmtShortDate(it.fecha),
        amount: fmtClp(it.monto),
        dteId: it.dteId,
      });
    }
    // Drift legado solo si no hay bloque execution (fallback).
    if (cell.drift != null && !cell.execution) {
      const d = cell.drift;
      drift = {
        projected: cell.projected != null ? fmtClp(cell.projected) : "—",
        real: fmtClp(Math.abs(total)),
        delta: `${d.delta > 0 ? "▲" : d.delta < 0 ? "▼" : "·"} ${fmtClp(Math.abs(d.delta))}`,
        pct: d.pct != null ? `${d.pct.toFixed(1)}%` : null,
        positive: d.delta >= 0,
      };
    }
  }

  let execution: HoverExecution | null = null;
  const ex = cell.execution;
  if (ex && ex.state !== "none") {
    const pendingLabel =
      ex.state === "over"
        ? "Sobre proyección"
        : ex.state === "closed"
          ? "Por ejecutar (cerrado)"
          : "Por ejecutar";
    const pendingValue =
      ex.state === "over"
        ? `▲ +${fmtClp(ex.over)}`
        : fmtClp(Math.abs(ex.residual));
    execution = {
      projected: fmtClp(ex.projected),
      real: fmtClp(ex.real),
      pendingLabel,
      pendingValue,
      pctLabel: ex.pct != null ? `${Math.round(ex.pct)}% ejecutado` : null,
      state: ex.state,
    };
  }

  const past = pastPendingGhostMeta(cell, args.isPast === true);
  const pastPending =
    past && (cell.layer === "real" || cell.layer === "empty") ? past.title : null;

  const reason = args.reason?.trim();
  const rowNumber = args.rowNumber ?? 0;

  const dteItems = (cell.committed?.items ?? []).filter((i) => i.kind === "dte");
  const primaryDte = dteItems[0] ?? null;
  let term: HoverTermInfo | null = null;
  let cession: HoverCessionInfo | null = null;
  let cobranza: HoverCobranzaTarget | null = null;
  if (primaryDte) {
    if (primaryDte.dueYmd) {
      const source = primaryDte.termSource ?? "default";
      const days = primaryDte.termDays ?? null;
      const daysTxt =
        days != null ? `${days} día${days === 1 ? "" : "s"} desde emisión` : null;
      term = {
        dueYmd: primaryDte.dueYmd,
        days,
        source,
        label: [
          `Vence ${fmtShortDate(primaryDte.dueYmd)}`,
          daysTxt,
          `[${termSourceLabel(source)}]`,
        ]
          .filter(Boolean)
          .join(" · "),
        editable: !!row.recurringTemplateId,
      };
    }
    if (primaryDte.isCededRetention || (primaryDte.cededPct ?? 0) > 0 || primaryDte.ceded) {
      cession = {
        pct: primaryDte.cededPct && primaryDte.cededPct > 0 ? primaryDte.cededPct : 100,
        factorName: primaryDte.factorName ?? null,
        funded: primaryDte.factoringFunded === true,
        dueYmd: primaryDte.cesionDueYmd ?? null,
        isRetention: primaryDte.isCededRetention === true,
      };
    }
  }
  const overdueDte = dteItems.find((i) => (i.overdueDays ?? 0) > 0 && i.dteId);
  if (overdueDte?.dteId) {
    cobranza = {
      dteId: overdueDte.dteId,
      crmAccountId: overdueDte.crmAccountId ?? row.crmAccountId ?? null,
      daysOverdue: overdueDte.overdueDays ?? 0,
    };
  }

  const week = weekLabel(cell.weekStart);
  const realFecha = cell.layer === "real" ? cell.real?.items?.[0]?.fecha : null;
  const subtitle = realFecha
    ? `${week} · cobrado ${fmtDayMonth(realFecha)}`
    : `${week} · ${fmtDayMonth(cell.weekStart)}`;
  const hasClickableDte = items.some((i) => !!i.dteId);
  // En REAL el badge + fondo verde ya bastan; el tip de colores estorba.
  const colorMeaning =
    cell.layer === "real" ? null : resolveCellColorMeaning(cell);

  return {
    concept: row.name,
    ref: `${columnLetter(colIdx + 1)}${rowNumber || ""}`,
    weekLabel: fmtDayMonth(cell.weekStart),
    subtitle,
    layerLabel: LAYER_LABEL[cell.layer],
    badges,
    colorMeaning,
    lines,
    items,
    execution,
    drift,
    pastPending,
    note: cell.note?.trim() || null,
    footerHint:
      reason ||
      (hasClickableDte
        ? "Clic en F° → factura"
        : "Doble clic editar · Más…"),
    term,
    cession,
    cobranza,
  };
}
