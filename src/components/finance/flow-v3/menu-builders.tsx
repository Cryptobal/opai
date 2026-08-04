"use client";

import type React from "react";
import type { CommittedItem } from "@/modules/finance/flow-v3/types";
import type { FlowMatrixCellDto, FlowMatrixRowDto } from "@/modules/finance/flow-v3/matrix-types";
import type { MatrixColumn } from "@/modules/finance/flow-v3/matrix-types";
import { draftGroupLabel, terminoStatusLine } from "./cell-meta";
import { fmtClp, fmtDayMonth, fmtShortDate } from "./format";
import type { MenuItemDesc } from "./menu-render";

const EGRESO_SECTIONS = new Set(["REMUNERACIONES", "IMPUESTOS", "GAV", "OTROS"]);

export interface RowTemplate {
  templateId: string;
  label: string;
  endDate: string | null;
  diasCobro: number | null;
  /** Próxima fecha de emisión proyectada (YYYY-MM-DD). */
  nextIssueYmd: string | null;
}

/** Programaciones (cuotas scheduled) presentes en la fila, deduplicadas. */
export function extractRowTemplates(row: FlowMatrixRowDto): RowTemplate[] {
  const byId = new Map<string, RowTemplate>();
  for (const cell of row.cells) {
    for (const it of cell.committed?.items ?? []) {
      if (it.kind !== "scheduled" || !it.templateId) continue;
      const issue = it.issueYmd ?? it.fecha;
      const existing = byId.get(it.templateId);
      if (!existing) {
        byId.set(it.templateId, {
          templateId: it.templateId,
          label: it.label,
          endDate: it.endDate ?? null,
          diasCobro: it.terminoDias ?? null,
          nextIssueYmd: issue,
        });
      } else if (
        issue &&
        (!existing.nextIssueYmd || issue < existing.nextIssueYmd)
      ) {
        existing.nextIssueYmd = issue;
      }
    }
  }
  return [...byId.values()];
}

export interface RowMenuCallbacks {
  onRename: (row: FlowMatrixRowDto) => void;
  onRestoreName: (row: FlowMatrixRowDto) => void;
  onChangeSection: (row: FlowMatrixRowDto) => void;
  onChangeCategory: (row: FlowMatrixRowDto) => void;
  onDeferTerm: (row: FlowMatrixRowDto, t: RowTemplate) => void;
  onSetDiasCobro: (row: FlowMatrixRowDto, t: RowTemplate) => void;
  onRecurring: (row: FlowMatrixRowDto) => void;
  onArchive: (row: FlowMatrixRowDto) => void;
  onUnarchive: (row: FlowMatrixRowDto) => void;
  onDelete: (row: FlowMatrixRowDto) => void;
}

function mappingSourceLabel(mapping: string): string {
  if (mapping === "ACCOUNT_INSTALLATION") return "la cuenta";
  if (mapping === "SUPPLIER") return "el proveedor";
  if (mapping === "CATEGORY") return "la categoría";
  return "la fuente";
}

/** Menú de la fila (§5C). Sin ítems para filas virtuales. */
export function buildRowMenu(
  row: FlowMatrixRowDto,
  templates: RowTemplate[],
  cb: RowMenuCallbacks,
): MenuItemDesc[] {
  if (row.isVirtual) return [];
  const items: MenuItemDesc[] = [];

  if (row.nameIsManual && row.sourceName) {
    items.push({
      key: "rename",
      label: "Renombrar",
      reason: `Nombre manual (origen: ${row.sourceName})`,
      onSelect: () => cb.onRename(row),
    });
    items.push({
      key: "restore-name",
      label: `Restaurar nombre de ${mappingSourceLabel(row.mapping)}`,
      onSelect: () => cb.onRestoreName(row),
    });
  } else if (row.mapping !== "MANUAL" && row.sourceName) {
    items.push({
      key: "rename",
      label: "Renombrar",
      reason: `Visible en planilla · origen: ${mappingSourceLabel(row.mapping)}`,
      onSelect: () => cb.onRename(row),
    });
  } else {
    items.push({ key: "rename", label: "Renombrar", onSelect: () => cb.onRename(row) });
  }

  items.push({ key: "section", label: "Cambiar sección…", onSelect: () => cb.onChangeSection(row) });

  items.push(
    row.mapping === "CATEGORY"
      ? { key: "category", label: "Cambiar categoría…", onSelect: () => cb.onChangeCategory(row) }
      : {
          key: "category",
          label: "Cambiar categoría…",
          disabled: true,
          reason: "Solo filas de categoría",
        },
  );

  if (templates.length > 0) {
    const actionsFor = (t: RowTemplate): MenuItemDesc[] => {
      const out: MenuItemDesc[] = [];
      if (t.nextIssueYmd) {
        out.push({
          key: `next-${t.templateId}`,
          label: `Próxima: emite ${fmtShortDate(t.nextIssueYmd)}`,
          disabled: true,
        });
      }
      out.push({
        key: `defer-${t.templateId}`,
        label: "Aplazar/fijar término…",
        onSelect: () => cb.onDeferTerm(row, t),
      });
      out.push({
        key: `dias-${t.templateId}`,
        label: "Días de cobro…",
        onSelect: () => cb.onSetDiasCobro(row, t),
      });
      return out;
    };
    const submenu: MenuItemDesc[] =
      templates.length === 1
        ? actionsFor(templates[0]!)
        : templates.map((t) => ({
            key: `tpl-${t.templateId}`,
            label: t.label || "Programación",
            submenu: actionsFor(t),
          }));
    items.push({ key: "prog", label: "Programación", separatorBefore: true, submenu });
  }

  if (EGRESO_SECTIONS.has(row.section)) {
    items.push({
      key: "recurring",
      label: "Egreso recurrente…",
      separatorBefore: true,
      onSelect: () => cb.onRecurring(row),
    });
  }

  items.push(
    row.isArchived
      ? {
          key: "unarchive",
          label: "Desarchivar fila",
          separatorBefore: true,
          onSelect: () => cb.onUnarchive(row),
        }
      : {
          key: "archive",
          label: "Archivar fila",
          separatorBefore: true,
          danger: true,
          onSelect: () => cb.onArchive(row),
        },
  );

  const hasVisibleData = row.cells.some((c) => c.plan !== 0 || c.committed || c.real);
  items.push(
    hasVisibleData
      ? {
          key: "delete",
          label: "Eliminar fila",
          disabled: true,
          reason: "Tiene movimiento: archívala",
        }
      : { key: "delete", label: "Eliminar fila", danger: true, onSelect: () => cb.onDelete(row) },
  );

  return items;
}

export interface CellMenuCallbacks {
  onEditAmount: () => void;
  onFillRight: () => void;
  onClearPlan: () => void;
  onMovePlan: (targetWeek: string) => void;
  onMoveDte: (dteId: string, targetWeek: string) => void;
  onViewDetail: () => void;
  onViewDte: (dteId: string) => void;
  onLinkTemplate?: (dteId: string) => void;
  onExcludeDte?: (dteId: string) => void;
  onRegisterPayment?: (dteId: string) => void;
}

export interface CellMenuContext {
  editable: boolean;
  reason: string;
  openWeeks: MatrixColumn[];
  dteMoveWeeks: MatrixColumn[];
  canManage: boolean;
  rowName?: string;
  /** Lunes ISO de la semana actual (para agrupar mover factura). */
  currentWeek: string;
  /** Lunes ISO de la celda activa (para marcar "próxima"). */
  cellWeekStart?: string;
}

type DteMenuItem = {
  dteId: string;
  folio?: number;
  label: string;
  monto: number;
  overdueDays?: number;
  overdueOver60?: boolean;
  emissionYmd?: string;
  dueYmd?: string;
};

type DraftMenuItem = {
  dteId: string;
  label: string;
  monto: number;
  issueYmd?: string;
  fecha: string;
  terminoDias?: number | null;
  cobroEstYmd?: string | null;
  sentDocs: { proforma: boolean; estadoPago: boolean };
};

function cellDteItems(cell: FlowMatrixCellDto): DteMenuItem[] {
  const items = (cell.committed?.items ?? [])
    .filter((i): i is typeof i & { dteId: string } => i.kind === "dte" && !!i.dteId)
    .map((i) => ({
      dteId: i.dteId,
      folio: i.folio,
      label: i.label,
      monto: i.monto,
      overdueDays: i.overdueDays,
      overdueOver60: i.overdueOver60,
      emissionYmd: i.emissionYmd,
      dueYmd: i.dueYmd,
    }));
  return items.sort((a, b) => (b.overdueDays ?? 0) - (a.overdueDays ?? 0));
}

function cellDraftItems(cell: FlowMatrixCellDto): DraftMenuItem[] {
  return (cell.committed?.items ?? [])
    .filter((i): i is CommittedItem & { dteId: string; kind: "draft" } =>
      i.kind === "draft" && !!i.dteId,
    )
    .map((i) => ({
      dteId: i.dteId,
      label: i.label,
      monto: i.monto,
      issueYmd: i.issueYmd,
      fecha: i.fecha,
      terminoDias: i.terminoDias,
      cobroEstYmd: i.cobroEstYmd,
      sentDocs: {
        proforma: i.sentDocs?.proforma === true,
        estadoPago: i.sentDocs?.estadoPago === true,
      },
    }));
}

function folioLabel(d: DteMenuItem): string {
  return d.folio != null ? `F°${d.folio}` : d.label || "Factura";
}

function weekLabelNode(c: MatrixColumn, pill?: string): React.ReactNode {
  return (
    <span className="flex w-full items-center justify-between gap-2">
      <span>
        {c.label} · {fmtDayMonth(c.weekStart)}
      </span>
      {pill && (
        <span className="shrink-0 rounded-full border border-ds-border-subtle bg-ds-surface-2 px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-ds-text-3">
          {pill}
        </span>
      )}
    </span>
  );
}

function weekSubmenu(
  dteId: string,
  weeks: MatrixColumn[],
  ctx: CellMenuContext,
  onMove: (dteId: string, targetWeek: string) => void,
): MenuItemDesc[] {
  const backward = weeks
    .filter((w) => w.isPast)
    .sort((a, b) => b.key.localeCompare(a.key));
  const forward = weeks
    .filter((w) => !w.isPast)
    .sort((a, b) => a.key.localeCompare(b.key));
  const anchor = ctx.cellWeekStart ?? ctx.currentWeek;
  const nextUpcoming =
    forward.find((w) => w.key > anchor) ?? forward[0] ?? null;

  const out: MenuItemDesc[] = [];

  if (backward.length > 0) {
    out.push({
      key: `back-hdr-${dteId}`,
      label: "HACIA ATRÁS (abiertas)",
      disabled: true,
    });
    for (const c of backward) {
      out.push({
        key: `mdte-${dteId}-${c.key}`,
        label: weekLabelNode(c, "atrás"),
        onSelect: () => onMove(dteId, c.key),
      });
    }
  }

  if (forward.length > 0) {
    out.push({
      key: `fwd-hdr-${dteId}`,
      label: "HACIA ADELANTE",
      disabled: true,
      separatorBefore: backward.length > 0,
    });
    for (const c of forward) {
      const pill = nextUpcoming && c.key === nextUpcoming.key ? "próxima" : undefined;
      out.push({
        key: `mdte-${dteId}-${c.key}`,
        label: weekLabelNode(c, pill),
        onSelect: () => onMove(dteId, c.key),
      });
    }
  }

  out.push({
    key: `sealed-note-${dteId}`,
    label: "Las semanas cerradas no aparecen",
    disabled: true,
    separatorBefore: true,
  });

  return out;
}

function folioStatusLine(d: DteMenuItem): string {
  const parts: string[] = [];
  if (d.emissionYmd) parts.push(`Emitida ${fmtShortDate(d.emissionYmd)}`);
  if (d.dueYmd) parts.push(`vence ${fmtShortDate(d.dueYmd)}`);
  const overdue = d.overdueDays && d.overdueDays > 0;
  parts.push(overdue ? `vencida hace ${d.overdueDays} d` : "Pendiente");
  return parts.join(" · ");
}

function folioTitleLine(d: DteMenuItem, rowName: string): string {
  return `${folioLabel(d)} · ${rowName} · ${fmtClp(d.monto)}`;
}

function draftStatusLine(d: DraftMenuItem): string {
  const base = terminoStatusLine(
    {
      issueYmd: d.issueYmd,
      fecha: d.fecha,
      terminoDias: d.terminoDias,
      cobroEstYmd: d.cobroEstYmd,
    },
    fmtShortDate,
  );
  if (base) return base.startsWith("Emite")
    ? base.replace(/^Emite/, "Fecha doc")
    : `Fecha doc ${fmtShortDate(d.issueYmd ?? d.fecha)}`;
  return `Fecha doc ${fmtShortDate(d.issueYmd ?? d.fecha)}`;
}

function draftTitleLine(d: DraftMenuItem): string {
  return `${draftGroupLabel(d.sentDocs, d.label)} · ${fmtClp(d.monto)}`;
}

/** Acciones por borrador (mover + ver). */
function draftActions(
  d: DraftMenuItem,
  ctx: CellMenuContext,
  cb: CellMenuCallbacks,
  opts?: { separatorBeforeFirst?: boolean },
): MenuItemDesc[] {
  const canMove = ctx.canManage && ctx.dteMoveWeeks.length > 0;
  const out: MenuItemDesc[] = [];
  out.push({
    key: `move-draft-${d.dteId}`,
    label: "Mover a otra semana",
    separatorBefore: opts?.separatorBeforeFirst,
    disabled: !canMove,
    reason: !ctx.canManage
      ? "Sin permiso de edición"
      : "No hay semanas abiertas",
    submenu: canMove
      ? weekSubmenu(d.dteId, ctx.dteMoveWeeks, ctx, cb.onMoveDte)
      : undefined,
  });
  out.push({
    key: `view-draft-${d.dteId}`,
    label: "Ver borrador",
    onSelect: () => cb.onViewDte(d.dteId),
  });
  return out;
}

/** Acciones por folio (compartidas entre context-menu y sheet). */
function folioActions(
  d: DteMenuItem,
  row: FlowMatrixRowDto,
  ctx: CellMenuContext,
  cb: CellMenuCallbacks,
  opts?: { separatorBeforeFirst?: boolean },
): MenuItemDesc[] {
  const canMoveDte = ctx.canManage && ctx.dteMoveWeeks.length > 0;
  const isOtros =
    row.isVirtual ||
    row.name === "Otros ingresos" ||
    row.name === "Otros clientes";
  const out: MenuItemDesc[] = [];

  out.push({
    key: `move-dte-${d.dteId}`,
    label: `Mover ${folioLabel(d)} a…`,
    separatorBefore: opts?.separatorBeforeFirst,
    disabled: !canMoveDte,
    reason: !ctx.canManage
      ? "Sin permiso de edición"
      : "No hay semanas abiertas",
    submenu: canMoveDte
      ? weekSubmenu(d.dteId, ctx.dteMoveWeeks, ctx, cb.onMoveDte)
      : undefined,
  });
  out.push({
    key: `view-dte-${d.dteId}`,
    label: `Ver ${folioLabel(d)}`,
    onSelect: () => cb.onViewDte(d.dteId),
  });
  if (isOtros && ctx.canManage && cb.onLinkTemplate) {
    out.push({
      key: `link-${d.dteId}`,
      label: "Vincular/corregir programación…",
      onSelect: () => cb.onLinkTemplate!(d.dteId),
    });
  }
  if (ctx.canManage && cb.onExcludeDte) {
    out.push({
      key: `exclude-${d.dteId}`,
      label: "Excluir del flujo",
      danger: true,
      onSelect: () => cb.onExcludeDte!(d.dteId),
    });
  }
  if (cb.onRegisterPayment) {
    out.push({
      key: `pay-${d.dteId}`,
      label: "Registrar pago…",
      onSelect: () => cb.onRegisterPayment!(d.dteId),
    });
  }
  return out;
}

function planCellItems(
  cell: FlowMatrixCellDto,
  ctx: CellMenuContext,
  cb: CellMenuCallbacks,
): MenuItemDesc[] {
  const ed = ctx.editable;
  const r = ctx.reason;
  const items: MenuItemDesc[] = [];
  items.push({
    key: "edit",
    label: "Editar monto",
    disabled: !ed,
    reason: r,
    onSelect: ed ? cb.onEditAmount : undefined,
  });
  items.push({
    key: "fill",
    label: "Copiar a las semanas siguientes…",
    disabled: !ed,
    reason: r,
    onSelect: ed ? cb.onFillRight : undefined,
  });
  items.push({
    key: "clear",
    label: "Quitar de esta semana",
    disabled: !ed || cell.plan === 0,
    reason: !ed ? r : "Sin plan en la celda",
    onSelect: ed && cell.plan !== 0 ? cb.onClearPlan : undefined,
  });
  const canMove = ed && cell.layer === "plan" && cell.plan !== 0 && ctx.openWeeks.length > 0;
  items.push({
    key: "move",
    label: "Mover a otra semana",
    disabled: !canMove,
    reason: !ed
      ? r
      : cell.layer !== "plan" || cell.plan === 0
        ? "Solo celdas de plan con monto"
        : "No hay semanas abiertas",
    submenu: canMove
      ? ctx.openWeeks.map((c) => ({
          key: `move-${c.key}`,
          label: `${c.label} · ${fmtDayMonth(c.weekStart)}`,
          onSelect: () => cb.onMovePlan(c.key),
        }))
      : undefined,
  });
  return items;
}

/** Menú de la celda (§5D / v4.6 por folio · v4.7 borradores movibles). */
export function buildCellMenu(
  row: FlowMatrixRowDto,
  cell: FlowMatrixCellDto,
  ctx: CellMenuContext,
  cb: CellMenuCallbacks,
): MenuItemDesc[] {
  const dteItems = cellDteItems(cell);
  const draftItems = cellDraftItems(cell);
  const hasDocs = dteItems.length > 0 || draftItems.length > 0;
  const items: MenuItemDesc[] = hasDocs ? [] : planCellItems(cell, ctx, cb);

  if (dteItems.length === 1) {
    items.push(...folioActions(dteItems[0]!, row, ctx, cb));
  } else if (dteItems.length > 1) {
    const canMoveDte = ctx.canManage && ctx.dteMoveWeeks.length > 0;
    items.push({
      key: "move-dte",
      label: "Mover factura a…",
      separatorBefore: true,
      disabled: !canMoveDte,
      reason: !ctx.canManage ? "Sin permiso de edición" : "No hay semanas abiertas",
      submenu: canMoveDte
        ? dteItems.map((d) => ({
            key: `mdte-pick-${d.dteId}`,
            label: folioLabel(d),
            submenu: weekSubmenu(d.dteId, ctx.dteMoveWeeks, ctx, cb.onMoveDte),
          }))
        : undefined,
    });
    items.push({
      key: "view-dte",
      label: "Ver factura",
      submenu: dteItems.map((d) => ({
        key: `view-${d.dteId}`,
        label: folioLabel(d),
        onSelect: () => cb.onViewDte(d.dteId),
      })),
    });
    if (ctx.canManage && cb.onExcludeDte) {
      items.push({
        key: "exclude-dte",
        label: "Excluir del flujo",
        danger: true,
        submenu: dteItems.map((d) => ({
          key: `exclude-${d.dteId}`,
          label: folioLabel(d),
          danger: true,
          onSelect: () => cb.onExcludeDte!(d.dteId),
        })),
      });
    }
    if (cb.onRegisterPayment) {
      items.push({
        key: "pay-dte",
        label: "Registrar pago…",
        submenu: dteItems.map((d) => ({
          key: `pay-${d.dteId}`,
          label: folioLabel(d),
          onSelect: () => cb.onRegisterPayment!(d.dteId),
        })),
      });
    }
    const isOtros =
      row.isVirtual ||
      row.name === "Otros ingresos" ||
      row.name === "Otros clientes";
    if (isOtros && ctx.canManage && cb.onLinkTemplate) {
      items.push({
        key: "link-tpl",
        label: "Vincular a programación…",
        submenu: dteItems.map((d) => ({
          key: `link-${d.dteId}`,
          label: folioLabel(d),
          onSelect: () => cb.onLinkTemplate!(d.dteId),
        })),
      });
    }
  }

  if (draftItems.length === 1) {
    items.push(...draftActions(draftItems[0]!, ctx, cb, { separatorBeforeFirst: dteItems.length > 0 }));
  } else if (draftItems.length > 1) {
    const canMove = ctx.canManage && ctx.dteMoveWeeks.length > 0;
    items.push({
      key: "move-draft",
      label: "Mover borrador a…",
      separatorBefore: true,
      disabled: !canMove,
      reason: !ctx.canManage ? "Sin permiso de edición" : "No hay semanas abiertas",
      submenu: canMove
        ? draftItems.map((d) => ({
            key: `mdraft-pick-${d.dteId}`,
            label: draftGroupLabel(d.sentDocs, d.label),
            submenu: weekSubmenu(d.dteId, ctx.dteMoveWeeks, ctx, cb.onMoveDte),
          }))
        : undefined,
    });
    items.push({
      key: "view-draft",
      label: "Ver borrador",
      submenu: draftItems.map((d) => ({
        key: `view-draft-${d.dteId}`,
        label: draftGroupLabel(d.sentDocs, d.label),
        onSelect: () => cb.onViewDte(d.dteId),
      })),
    });
  }

  items.push({
    key: "detail",
    label: "Ver detalle e historial",
    separatorBefore: true,
    onSelect: cb.onViewDetail,
  });

  return items;
}

/** Cabecera de grupo por folio en el CellActionSheet. */
export interface FolioSheetHeader {
  titleLine: string;
  statusLine: string;
}

export interface FolioSheetGroup {
  key: string;
  header: FolioSheetHeader;
  items: MenuItemDesc[];
}

export interface CellSheetModel {
  folioGroups: FolioSheetGroup[];
  commonItems: MenuItemDesc[];
}

/** Modelo agrupado por folio/borrador para el sheet móvil (v4.6/v4.7). */
export function buildCellSheetModel(
  row: FlowMatrixRowDto,
  cell: FlowMatrixCellDto,
  ctx: CellMenuContext,
  cb: CellMenuCallbacks,
): CellSheetModel {
  const dteItems = cellDteItems(cell);
  const draftItems = cellDraftItems(cell);
  const rowName = ctx.rowName ?? row.name;
  const folioGroups: FolioSheetGroup[] = [
    ...dteItems.map((d) => ({
      key: d.dteId,
      header: {
        titleLine: folioTitleLine(d, rowName),
        statusLine: folioStatusLine(d),
      },
      items: folioActions(d, row, ctx, cb),
    })),
    ...draftItems.map((d) => ({
      key: d.dteId,
      header: {
        titleLine: draftTitleLine(d),
        statusLine: draftStatusLine(d),
      },
      items: draftActions(d, ctx, cb),
    })),
  ];
  const hasDocs = dteItems.length > 0 || draftItems.length > 0;
  const commonItems: MenuItemDesc[] = hasDocs
    ? [
        {
          key: "detail",
          label: "Ver detalle e historial",
          separatorBefore: true,
          onSelect: cb.onViewDetail,
        },
      ]
    : [
        ...planCellItems(cell, ctx, cb),
        {
          key: "detail",
          label: "Ver detalle e historial",
          separatorBefore: true,
          onSelect: cb.onViewDetail,
        },
      ];
  return { folioGroups, commonItems };
}
