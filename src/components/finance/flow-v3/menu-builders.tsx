"use client";

import type { FlowMatrixCellDto, FlowMatrixRowDto } from "@/modules/finance/flow-v3/matrix-types";
import type { MatrixColumn } from "@/modules/finance/flow-v3/matrix-types";
import { fmtDayMonth } from "./format";
import type { MenuItemDesc } from "./menu-render";

const EGRESO_SECTIONS = new Set(["REMUNERACIONES", "IMPUESTOS", "GAV", "OTROS"]);

export interface RowTemplate {
  templateId: string;
  label: string;
  endDate: string | null;
  diasCobro: number | null;
}

/** Programaciones (cuotas scheduled) presentes en la fila, deduplicadas. */
export function extractRowTemplates(row: FlowMatrixRowDto): RowTemplate[] {
  const byId = new Map<string, RowTemplate>();
  for (const cell of row.cells) {
    for (const it of cell.committed?.items ?? []) {
      if (it.kind === "scheduled" && it.templateId && !byId.has(it.templateId)) {
        byId.set(it.templateId, {
          templateId: it.templateId,
          label: it.label,
          endDate: it.endDate ?? null,
          diasCobro: it.diasCobro ?? null,
        });
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

  // Alias de visualización: se puede renombrar aunque el mapping venga de
  // cuenta/categoría/proveedor. Si ya hay override, el menú lo deja explícito.
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
    const actionsFor = (t: RowTemplate): MenuItemDesc[] => [
      {
        key: `defer-${t.templateId}`,
        label: "Aplazar/fijar término…",
        onSelect: () => cb.onDeferTerm(row, t),
      },
      {
        key: `dias-${t.templateId}`,
        label: "Días de cobro…",
        onSelect: () => cb.onSetDiasCobro(row, t),
      },
    ];
    const submenu: MenuItemDesc[] =
      templates.length === 1
        ? actionsFor(templates[0])
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

  // Eliminar: aproximación cliente (sin datos visibles en la ventana). El
  // servidor es autoritativo (409 → ofrecer archivar).
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
  /** Vincular F° de "Otros ingresos" a una programación de su cuenta. */
  onLinkTemplate?: (dteId: string) => void;
  /** Excluir DTE del flujo (por folio). */
  onExcludeDte?: (dteId: string) => void;
  /**
   * Registrar pago por folio. B0: no hay diálogo reutilizable en planilla →
   * abre el DTE en facturación (deep-link).
   */
  onRegisterPayment?: (dteId: string) => void;
}

export interface CellMenuContext {
  editable: boolean;
  /** Motivo cuando !editable (semana pasada/sellada, fila archivada, etc.). */
  reason: string;
  /** Semanas abiertas de la misma fila a las que se puede mover (no la propia). */
  openWeeks: MatrixColumn[];
  /**
   * Semanas actuales/futuras no selladas (distintas de la propia) a las que se
   * puede reubicar una factura emitida cuando el cobro se aplaza.
   */
  dteMoveWeeks: MatrixColumn[];
  canManage: boolean;
  /** Nombre de la fila (para omitir receptor en cabecera si coincide). */
  rowName?: string;
}

type DteMenuItem = {
  dteId: string;
  folio?: number;
  label: string;
  monto: number;
  overdueDays?: number;
  overdueOver60?: boolean;
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
    }));
  // Vencidas primero (sheet / menú).
  return items.sort((a, b) => (b.overdueDays ?? 0) - (a.overdueDays ?? 0));
}

function folioLabel(d: DteMenuItem): string {
  return d.folio != null ? `F°${d.folio}` : d.label || "Factura";
}

function weekSubmenu(
  dteId: string,
  weeks: MatrixColumn[],
  onMove: (dteId: string, targetWeek: string) => void,
): MenuItemDesc[] {
  return weeks.map((c) => ({
    key: `mdte-${dteId}-${c.key}`,
    label: `${c.label} · ${fmtDayMonth(c.weekStart)}`,
    onSelect: () => onMove(dteId, c.key),
  }));
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
    submenu: canMoveDte ? weekSubmenu(d.dteId, ctx.dteMoveWeeks, cb.onMoveDte) : undefined,
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
    label: "Editar monto de plan",
    disabled: !ed,
    reason: r,
    onSelect: ed ? cb.onEditAmount : undefined,
  });
  items.push({
    key: "fill",
    label: "Rellenar a la derecha…",
    disabled: !ed,
    reason: r,
    onSelect: ed ? cb.onFillRight : undefined,
  });
  items.push({
    key: "clear",
    label: "Borrar plan de la celda",
    disabled: !ed || cell.plan === 0,
    reason: !ed ? r : "Sin plan en la celda",
    onSelect: ed && cell.plan !== 0 ? cb.onClearPlan : undefined,
  });
  const canMove = ed && cell.layer === "plan" && cell.plan !== 0 && ctx.openWeeks.length > 0;
  items.push({
    key: "move",
    label: "Mover plan a…",
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

/** Menú de la celda (§5D / v4.3 por folio). */
export function buildCellMenu(
  row: FlowMatrixRowDto,
  cell: FlowMatrixCellDto,
  ctx: CellMenuContext,
  cb: CellMenuCallbacks,
): MenuItemDesc[] {
  const items = planCellItems(cell, ctx, cb);
  const dteItems = cellDteItems(cell);

  if (dteItems.length === 1) {
    items.push(...folioActions(dteItems[0]!, row, ctx, cb, { separatorBeforeFirst: true }));
  } else if (dteItems.length > 1) {
    // Desktop: submenús por folio (mismo patrón que "Mover").
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
            submenu: weekSubmenu(d.dteId, ctx.dteMoveWeeks, cb.onMoveDte),
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
  folioLabel: string;
  receiver?: string;
  pendingClp: number;
  status: string;
  overdueDays?: number;
}

export interface FolioSheetGroup {
  key: string;
  header: FolioSheetHeader;
  items: MenuItemDesc[];
}

export interface CellSheetModel {
  folioGroups: FolioSheetGroup[];
  /** Acciones de plan/celda comunes (al final). */
  commonItems: MenuItemDesc[];
}

/** Modelo agrupado por folio para el sheet móvil (v4.3). */
export function buildCellSheetModel(
  row: FlowMatrixRowDto,
  cell: FlowMatrixCellDto,
  ctx: CellMenuContext,
  cb: CellMenuCallbacks,
): CellSheetModel {
  const dteItems = cellDteItems(cell);
  const folioGroups: FolioSheetGroup[] = dteItems.map((d) => {
    const overdue = d.overdueDays && d.overdueDays > 0 ? d.overdueDays : undefined;
    const receiver =
      d.label && d.label.trim() !== (ctx.rowName ?? row.name).trim()
        ? d.label
        : undefined;
    return {
      key: d.dteId,
      header: {
        folioLabel: folioLabel(d),
        receiver,
        pendingClp: d.monto,
        status: overdue ? "Vencida" : "Pendiente",
        overdueDays: overdue,
      },
      items: folioActions(d, row, ctx, cb),
    };
  });
  return {
    folioGroups,
    commonItems: [
      ...planCellItems(cell, ctx, cb),
      {
        key: "detail",
        label: "Ver detalle e historial",
        separatorBefore: true,
        onSelect: cb.onViewDetail,
      },
    ],
  };
}
