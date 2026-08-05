/**
 * Contenido puro de la ficha de detalle (clic) — testeable sin DOM.
 */
import type { FlowMatrixCellDto, FlowMatrixRowDto } from "@/modules/finance/flow-v3/matrix-types";
import { hasManualPlanOverride } from "@/modules/finance/flow-v3/cell-editability";
import { fmtClp, fmtDayMonth, fmtShortDate } from "./format";
import {
  committedItemMeta, LAYER_LABEL, pastPendingDteMeta, terminoStatusLine,
} from "./cell-meta";
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
}

export interface HoverDrift {
  projected: string;
  real: string;
  delta: string;
  pct: string | null;
  positive: boolean;
}

export interface HoverCardModel {
  concept: string;
  ref: string;
  weekLabel: string;
  layerLabel: string;
  badges: string[];
  lines: HoverLine[];
  items: HoverItemLine[];
  itemsMore: number;
  drift: HoverDrift | null;
  pastPending: string | null;
  note: string | null;
  footerHint: string;
}

const MAX_ITEMS = 3;

function itemStatus(it: Parameters<typeof committedItemMeta>[0]): string {
  if (it.kind === "dte") {
    const parts: string[] = [];
    if (it.emissionYmd) parts.push(fmtShortDate(it.emissionYmd));
    else parts.push(fmtShortDate(it.fecha));
    if (it.dueYmd) parts.push(`vence ${fmtShortDate(it.dueYmd)}`);
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
  let itemsMore = 0;
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
    const raw = cell.committed?.items ?? [];
    for (const it of raw.slice(0, MAX_ITEMS)) {
      const meta = committedItemMeta(it);
      items.push({
        tag: meta.tag,
        label: it.label,
        status: itemStatus(it),
        amount: fmtClp(it.monto),
      });
    }
    itemsMore = Math.max(0, raw.length - MAX_ITEMS);
  }

  if (cell.layer === "real") {
    const total = cell.real?.total ?? 0;
    lines.push({ label: "Real", value: fmtClp(Math.abs(total)), emphasize: true });
    const raw = cell.real?.items ?? [];
    for (const it of raw.slice(0, MAX_ITEMS)) {
      items.push({
        tag: it.folio != null ? `F°${it.folio}` : "Pago",
        label: it.label,
        status: fmtShortDate(it.fecha),
        amount: fmtClp(it.monto),
      });
    }
    itemsMore = Math.max(0, raw.length - MAX_ITEMS);
    if (cell.drift != null) {
      const d = cell.drift;
      drift = {
        projected: cell.projected != null ? fmtClp(cell.projected) : "—",
        real: fmtClp(Math.abs(total)),
        delta: `${d.delta > 0 ? "▲" : d.delta < 0 ? "▼" : "·"} ${fmtClp(Math.abs(d.delta))}`,
        pct: d.pct != null ? `${d.pct > 0 ? "+" : ""}${d.pct.toFixed(1)}%` : null,
        positive: d.delta >= 0,
      };
    }
  }

  const past = pastPendingDteMeta(cell, args.isPast === true);
  const pastPending =
    past && (cell.layer === "real" || cell.layer === "empty") ? past.title : null;

  const reason = args.reason?.trim();
  const rowNumber = args.rowNumber ?? 0;

  return {
    concept: row.name,
    ref: `${columnLetter(colIdx + 1)}${rowNumber || ""}`,
    weekLabel: fmtDayMonth(cell.weekStart),
    layerLabel: LAYER_LABEL[cell.layer],
    badges,
    lines,
    items,
    itemsMore,
    drift,
    pastPending,
    note: cell.note?.trim() || null,
    footerHint: reason || "Doble clic editar · N nota · Acciones ▾",
  };
}
