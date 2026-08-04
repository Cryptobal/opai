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
}

/** Menú de la celda (§5D). Ítems inaplicables van deshabilitados con motivo. */
export function buildCellMenu(
  row: FlowMatrixRowDto,
  cell: FlowMatrixCellDto,
  ctx: CellMenuContext,
  cb: CellMenuCallbacks,
): MenuItemDesc[] {
  const items: MenuItemDesc[] = [];
  const ed = ctx.editable;
  const r = ctx.reason;

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

  const dteItems = (cell.committed?.items ?? []).filter(
    (i): i is typeof i & { dteId: string } => i.kind === "dte" && !!i.dteId,
  );
  if (dteItems.length > 0) {
    const canMoveDte = ctx.canManage && ctx.dteMoveWeeks.length > 0;
    const weekSubmenu = (dteId: string): MenuItemDesc[] =>
      ctx.dteMoveWeeks.map((c) => ({
        key: `mdte-${dteId}-${c.key}`,
        label: `${c.label} · ${fmtDayMonth(c.weekStart)}`,
        onSelect: () => cb.onMoveDte(dteId, c.key),
      }));
    if (dteItems.length === 1) {
      const d = dteItems[0];
      items.push({
        key: "move-dte",
        label: d.folio != null ? `Mover F°${d.folio} a…` : "Mover factura a…",
        disabled: !canMoveDte,
        reason: !ctx.canManage
          ? "Sin permiso de edición"
          : "No hay semanas abiertas",
        submenu: canMoveDte ? weekSubmenu(d.dteId) : undefined,
      });
    } else {
      items.push({
        key: "move-dte",
        label: "Mover factura a…",
        disabled: !canMoveDte,
        reason: !ctx.canManage
          ? "Sin permiso de edición"
          : "No hay semanas abiertas",
        submenu: canMoveDte
          ? dteItems.map((d) => ({
              key: `mdte-pick-${d.dteId}`,
              label: d.folio != null ? `F°${d.folio}` : d.label || "Factura",
              submenu: weekSubmenu(d.dteId),
            }))
          : undefined,
      });
    }
  }

  items.push({
    key: "detail",
    label: "Ver detalle e historial",
    separatorBefore: true,
    onSelect: cb.onViewDetail,
  });

  const dteId = dteItems[0]?.dteId;
  if (dteId) {
    items.push({ key: "dte", label: "Ver factura", onSelect: () => cb.onViewDte(dteId) });
  }

  const isOtrosIngresos =
    row.isVirtual || row.name === "Otros ingresos" || row.name === "Otros clientes";
  if (isOtrosIngresos && dteItems.length > 0 && ctx.canManage && cb.onLinkTemplate) {
    if (dteItems.length === 1) {
      items.push({
        key: "link-tpl",
        label: "Vincular a programación…",
        separatorBefore: true,
        onSelect: () => cb.onLinkTemplate!(dteItems[0].dteId),
      });
    } else {
      items.push({
        key: "link-tpl",
        label: "Vincular a programación…",
        separatorBefore: true,
        submenu: dteItems.map((d) => ({
          key: `link-${d.dteId}`,
          label: d.folio != null ? `F°${d.folio}` : d.label || "Factura",
          onSelect: () => cb.onLinkTemplate!(d.dteId),
        })),
      });
    }
  }

  return items;
}
