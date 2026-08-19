"use client";

import type React from "react";
import type { CommittedItem } from "@/modules/finance/flow-v3/types";
import type { FlowMatrixCellDto, FlowMatrixRowDto } from "@/modules/finance/flow-v3/matrix-types";
import type { MatrixColumn } from "@/modules/finance/flow-v3/matrix-types";
import { normalizeNameForDedupe } from "@/modules/finance/flow-v3/row-visibility";
import { isFallbackBandejaRow } from "@/modules/finance/flow-v3/unmatched-count";
import { draftGroupLabel, terminoStatusLine } from "./cell-meta";
import { fmtClp, fmtDayMonth, fmtShortDate } from "./format";
import type { MenuItemDesc } from "./menu-render";

const PLAN_RECURRENCE_SECTIONS = new Set([
  "REMUNERACIONES", "IMPUESTOS", "GAV", "OTROS", "FINANCIAMIENTO",
]);

/** Filas paramétricas v5 que admiten "Mover" desde capa committed. */
const PARAMETRIC_MOVE_NAMES = new Set([
  "retiro socios",
  "retiro socio",
  "finiquitos",
  "finiquito",
  "turnos extra",
  "turno extra",
]);

export function isParametricMoveRow(rowName: string): boolean {
  return PARAMETRIC_MOVE_NAMES.has(normalizeNameForDedupe(rowName));
}

export function isRetiroSociosRow(rowName: string): boolean {
  const n = normalizeNameForDedupe(rowName);
  return n === "retiro socios" || n === "retiro socio";
}

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
  onChangeAccounts: (row: FlowMatrixRowDto) => void;
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
  if (mapping === "ACCOUNTS" || mapping === "CATEGORY") return "las cuentas";
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

  const isBandeja = isFallbackBandejaRow(row);
  const canAssignAccounts =
    !row.isVirtual &&
    !isBandeja &&
    row.section !== "INGRESOS" &&
    (row.mapping === "ACCOUNTS" ||
      row.mapping === "CATEGORY" ||
      row.mapping === "MANUAL");
  items.push(
    canAssignAccounts
      ? {
          key: "accounts",
          label: row.mapping === "ACCOUNTS" ? "Editar cuentas…" : "Asignar cuentas…",
          onSelect: () => cb.onChangeAccounts(row),
        }
      : {
          key: "accounts",
          label: "Asignar cuentas…",
          disabled: true,
          reason: isBandeja
            ? "La bandeja no usa cuentas propias"
            : row.mapping === "ACCOUNT_INSTALLATION"
              ? "Filas de cuenta/instalación"
              : "Solo renglones de egreso",
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

  if (PLAN_RECURRENCE_SECTIONS.has(row.section)) {
    items.push({
      key: "recurring",
      label: row.section === "FINANCIAMIENTO" ? "Recurrencia…" : "Egreso recurrente…",
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
  /** Mueve proyección paramétrica committed vía plan overrides (origen→destino). */
  onMoveParametricCommitted?: (targetWeek: string) => void;
  onMoveDte: (dteId: string, targetWeek: string) => void;
  /** Mueve una cuota programada (P) a otra semana. No toca facturas. */
  onMoveScheduled?: (templateId: string, billingPeriod: string, targetWeek: string) => void;
  /** Mueve un hito de egreso (quincena, sueldos, …). */
  onMoveMilestone?: (milestoneKey: string, billingPeriod: string, targetWeek: string) => void;
  onViewDetail: () => void;
  /** Abre el detalle enfocado en el editor de nota. */
  onEditNote?: () => void;
  onViewDte: (dteId: string) => void;
  onLinkTemplate?: (dteId: string) => void;
  onExcludeDte?: (dteId: string) => void;
  onRegisterPayment?: (dteId: string) => void;
  /** Dar por cumplida la proyección (residual → 0). */
  onSettleCell?: () => void;
  /** Reabrir proyección dada por cumplida. */
  onReopenCell?: () => void;
  /** Escribir plan = |real| (o signado en FINANCIAMIENTO). */
  onMatchPlanToReal?: () => void;
  /** Cerrar origen + sumar residual al plan de la próxima semana. */
  onMoveResidual?: () => void;
  /** Abre el diálogo de cobranza multicanal para un DTE impago. */
  onSendCobranza?: (args: {
    dteId: string;
    crmAccountId: string | null;
    daysOverdue: number;
  }) => void;
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
  crmAccountId?: string | null;
  ceded?: boolean;
  cededPct?: number;
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
      crmAccountId: i.crmAccountId,
      ceded: i.ceded === true || (i.cededPct ?? 0) > 0,
      cededPct: i.cededPct,
    }));
  return items.sort((a, b) => (b.overdueDays ?? 0) - (a.overdueDays ?? 0));
}

function isCededMenuItem(d: DteMenuItem): boolean {
  return (d.cededPct ?? 0) > 0 || d.ceded === true;
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

type ScheduledMenuItem = {
  source: "template" | "milestone";
  templateId?: string;
  milestoneKey?: string;
  billingPeriod: string;
  label: string;
  monto: number;
  issueYmd?: string;
};

export function cellScheduledItems(cell: FlowMatrixCellDto): ScheduledMenuItem[] {
  return (cell.committed?.items ?? [])
    .filter((i): i is CommittedItem & { billingPeriod: string; kind: "scheduled" } =>
      i.kind === "scheduled" &&
      !!i.billingPeriod &&
      (!!i.templateId || !!i.milestoneKey),
    )
    .map((i) => ({
      source: i.milestoneKey && !i.templateId ? "milestone" : "template",
      templateId: i.templateId,
      milestoneKey: i.milestoneKey,
      billingPeriod: i.billingPeriod,
      label: i.label,
      monto: i.monto,
      issueYmd: i.issueYmd,
    }));
}

function scheduledMoveKey(s: ScheduledMenuItem): string {
  if (s.source === "milestone") return `ms:${s.milestoneKey}::${s.billingPeriod}`;
  return `tpl:${s.templateId}::${s.billingPeriod}`;
}

function folioLabel(d: DteMenuItem): string {
  return d.folio != null ? `F°${d.folio}` : d.label || "Factura";
}

/** Semana abierta inmediatamente posterior al ancla (celda activa). */
export function resolveNextWeekKey(weeks: MatrixColumn[], anchor: string): string | null {
  const sorted = [...weeks].sort((a, b) => a.key.localeCompare(b.key));
  return sorted.find((w) => w.key > anchor)?.key ?? null;
}

function weekLabelNode(c: MatrixColumn, isNext?: boolean): React.ReactNode {
  return (
    <span className="flex w-full items-center justify-between gap-2">
      <span>
        {c.label} · {fmtDayMonth(c.weekStart)}
      </span>
      {isNext && (
        <span className="shrink-0 rounded-full border border-status-info-border bg-status-info-soft px-1.5 py-0.5 text-[12px] text-status-info-fg">
          próxima semana
        </span>
      )}
    </span>
  );
}

function openWeekMoveSubmenu(
  keyPrefix: string,
  weeks: MatrixColumn[],
  ctx: CellMenuContext,
  onSelect: (weekKey: string) => void,
): MenuItemDesc[] {
  const sorted = [...weeks].sort((a, b) => a.key.localeCompare(b.key));
  const anchor = ctx.cellWeekStart ?? ctx.currentWeek;
  const nextKey = resolveNextWeekKey(sorted, anchor);
  return sorted.map((c) => {
    const isNext = c.key === nextKey;
    return {
      key: `${keyPrefix}-${c.key}`,
      label: weekLabelNode(c, isNext),
      highlight: isNext ? "next-week" : undefined,
      onSelect: () => onSelect(c.key),
    };
  });
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
        label: weekLabelNode(c, false),
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
      const isNext = !!(nextUpcoming && c.key === nextUpcoming.key);
      out.push({
        key: `mdte-${dteId}-${c.key}`,
        label: weekLabelNode(c, isNext),
        highlight: isNext ? "next-week" : undefined,
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
  const canCobranza = ctx.canManage && cb.onSendCobranza && !isCededMenuItem(d);
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
  if (canCobranza) {
    out.push({
      key: `cobranza-${d.dteId}`,
      label: "Enviar cobranza…",
      onSelect: () =>
        cb.onSendCobranza!({
          dteId: d.dteId,
          crmAccountId: d.crmAccountId ?? row.crmAccountId ?? null,
          daysOverdue: d.overdueDays ?? 0,
        }),
    });
  }
  return out;
}

/** Acciones por cuota programada (P): moverla sola, aunque haya factura en la celda. */
function scheduledMoveItems(
  scheduled: ScheduledMenuItem[],
  ctx: CellMenuContext,
  cb: CellMenuCallbacks,
  opts?: { separatorBeforeFirst?: boolean },
): MenuItemDesc[] {
  const canDispatch = scheduled.some((s) =>
    s.source === "milestone" ? !!cb.onMoveMilestone : !!cb.onMoveScheduled,
  );
  if (scheduled.length === 0 || !canDispatch) return [];
  const canMove = ctx.canManage && ctx.dteMoveWeeks.length > 0;
  const onMove = (key: string, week: string) => {
    if (key.startsWith("ms:")) {
      const rest = key.slice(3);
      const sep = rest.indexOf("::");
      cb.onMoveMilestone?.(rest.slice(0, sep), rest.slice(sep + 2), week);
      return;
    }
    const rest = key.startsWith("tpl:") ? key.slice(4) : key;
    const sep = rest.indexOf("::");
    cb.onMoveScheduled?.(rest.slice(0, sep), rest.slice(sep + 2), week);
  };
  const reason = !ctx.canManage ? "Sin permiso de edición" : "No hay semanas abiertas";
  if (scheduled.length === 1) {
    const s = scheduled[0]!;
    const key = scheduledMoveKey(s);
    return [
      {
        key: `move-sched-${key}`,
        label: "Mover esta P a…",
        separatorBefore: opts?.separatorBeforeFirst,
        disabled: !canMove,
        reason,
        submenu: canMove ? weekSubmenu(key, ctx.dteMoveWeeks, ctx, onMove) : undefined,
      },
    ];
  }
  return [
    {
      key: "move-sched",
      label: "Mover una P a…",
      separatorBefore: opts?.separatorBeforeFirst,
      disabled: !canMove,
      reason,
      submenu: canMove
        ? scheduled.map((s) => {
            const key = scheduledMoveKey(s);
            return {
              key: `msched-pick-${key}`,
              label: s.label || "Programación",
              submenu: weekSubmenu(key, ctx.dteMoveWeeks, ctx, onMove),
            };
          })
        : undefined,
    },
  ];
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
  if (cell.plan !== 0) {
    items.push({
      key: "clear",
      label: "Quitar de esta semana",
      disabled: !ed,
      reason: r,
      onSelect: ed ? cb.onClearPlan : undefined,
    });
    const canMove = ed && cell.layer === "plan" && ctx.openWeeks.length > 0;
    items.push({
      key: "move",
      label: "Mover a otra semana",
      disabled: !canMove,
      reason: !ed
        ? r
        : cell.layer !== "plan"
          ? "Solo celdas de plan con monto"
          : "No hay semanas abiertas",
      submenu: canMove
        ? openWeekMoveSubmenu("move", ctx.openWeeks, ctx, cb.onMovePlan)
        : undefined,
    });
  }

  const ex = cell.execution;
  if (ex && (ex.state === "partial" || ex.state === "closed" || ex.state === "over")) {
    if (ex.state === "partial" && cb.onSettleCell) {
      items.push({
        key: "settle-closed",
        label: "Dar por cumplido",
        disabled: !ctx.canManage,
        reason: !ctx.canManage ? "Sin permiso de edición" : r,
        onSelect: ctx.canManage ? cb.onSettleCell : undefined,
      });
    }
    if (ex.state === "closed" && cb.onReopenCell) {
      items.push({
        key: "settle-reopen",
        label: "Reabrir proyección",
        disabled: !ctx.canManage,
        reason: !ctx.canManage ? "Sin permiso de edición" : r,
        onSelect: ctx.canManage ? cb.onReopenCell : undefined,
      });
    }
    if (cb.onMatchPlanToReal) {
      items.push({
        key: "match-plan-real",
        label: "Ajustar proyección al real",
        disabled: !ed,
        reason: r,
        onSelect: ed ? cb.onMatchPlanToReal : undefined,
      });
    }
    if (ex.state === "partial" && cb.onMoveResidual) {
      items.push({
        key: "move-residual",
        label: "Mover pendiente a la próxima semana",
        disabled: !ed,
        reason: r,
        onSelect: ed ? cb.onMoveResidual : undefined,
      });
    }
  }
  return items;
}

/** Acciones para mover committed paramétrico (Retiro / opcional TE·Finiquitos). */
function parametricCommittedMoveItems(
  row: FlowMatrixRowDto,
  cell: FlowMatrixCellDto,
  ctx: CellMenuContext,
  cb: CellMenuCallbacks,
): MenuItemDesc[] {
  if (cell.layer !== "committed") return [];
  if (!isParametricMoveRow(row.name)) return [];
  if (!cb.onMoveParametricCommitted) return [];
  const amount = cell.committed?.total ?? 0;
  if (amount === 0) return [];
  const canMove = ctx.canManage && ctx.openWeeks.length > 0;
  return [
    {
      key: "move-parametric",
      label: "Mover a otra semana…",
      separatorBefore: true,
      disabled: !canMove,
      reason: !ctx.canManage
        ? "Sin permiso de edición"
        : "No hay semanas abiertas",
      submenu: canMove
        ? openWeekMoveSubmenu("move-param", ctx.openWeeks, ctx, (k) =>
            cb.onMoveParametricCommitted!(k),
          )
        : undefined,
    },
  ];
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
  const scheduledItems = cellScheduledItems(cell);
  const hasDocs = dteItems.length > 0 || draftItems.length > 0;
  const items: MenuItemDesc[] = hasDocs ? [] : planCellItems(cell, ctx, cb);

  items.push(
    ...scheduledMoveItems(scheduledItems, ctx, cb, {
      separatorBeforeFirst: items.length > 0,
    }),
  );

  if (!hasDocs) {
    items.push(...parametricCommittedMoveItems(row, cell, ctx, cb));
  } else {
    // Con docs: aún permitir mover paramétrico si la capa es committed sin DTE.
    const onlyScheduled =
      (cell.committed?.items ?? []).every((it) => it.kind === "scheduled");
    if (cell.layer === "committed" && onlyScheduled) {
      items.push(...parametricCommittedMoveItems(row, cell, ctx, cb));
    }
  }

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
    if (ctx.canManage && cb.onSendCobranza) {
      const cobrables = dteItems.filter((d) => !isCededMenuItem(d));
      if (cobrables.length === 1) {
        const d = cobrables[0]!;
        items.push({
          key: "cobranza-dte",
          label: "Enviar cobranza…",
          onSelect: () =>
            cb.onSendCobranza!({
              dteId: d.dteId,
              crmAccountId: d.crmAccountId ?? row.crmAccountId ?? null,
              daysOverdue: d.overdueDays ?? 0,
            }),
        });
      } else if (cobrables.length > 1) {
        items.push({
          key: "cobranza-dte",
          label: "Enviar cobranza…",
          submenu: cobrables.map((d) => ({
            key: `cobranza-${d.dteId}`,
            label: folioLabel(d),
            onSelect: () =>
              cb.onSendCobranza!({
                dteId: d.dteId,
                crmAccountId: d.crmAccountId ?? row.crmAccountId ?? null,
                daysOverdue: d.overdueDays ?? 0,
              }),
          })),
        });
      }
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
  if (cb.onEditNote) {
    items.push({
      key: "note",
      label: cell.note?.trim() ? "Editar nota…" : "Agregar nota…",
      onSelect: cb.onEditNote,
    });
  }

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
  const scheduledItems = cellScheduledItems(cell);
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
    ...scheduledItems.map((s) => ({
      key: scheduledMoveKey(s),
      header: {
        titleLine: `P · ${s.label} · ${fmtClp(s.monto)}`,
        statusLine: s.issueYmd ? `Emite ${fmtShortDate(s.issueYmd)}` : "Programada",
      },
      items: scheduledMoveItems([s], ctx, cb),
    })),
  ];
  const hasDocs = dteItems.length > 0 || draftItems.length > 0;
  const noteItem: MenuItemDesc | null = cb.onEditNote
    ? {
        key: "note",
        label: cell.note?.trim() ? "Editar nota…" : "Agregar nota…",
        onSelect: cb.onEditNote,
      }
    : null;
  const commonItems: MenuItemDesc[] = hasDocs
    ? [
        ...parametricCommittedMoveItems(row, cell, ctx, cb),
        {
          key: "detail",
          label: "Ver detalle e historial",
          separatorBefore: true,
          onSelect: cb.onViewDetail,
        },
        ...(noteItem ? [noteItem] : []),
      ]
    : [
        ...planCellItems(cell, ctx, cb),
        ...parametricCommittedMoveItems(row, cell, ctx, cb),
        {
          key: "detail",
          label: "Ver detalle e historial",
          separatorBefore: true,
          onSelect: cb.onViewDetail,
        },
        ...(noteItem ? [noteItem] : []),
      ];
  return { folioGroups, commonItems };
}

const CELL_PANEL_HIDDEN_KEYS = new Set(["detail", "note"]);

/** Acciones del menú de celda para el panel único (sin duplicar pestañas). */
export function panelActionsFromCellMenu(items: MenuItemDesc[]): MenuItemDesc[] {
  return items.filter((it) => !CELL_PANEL_HIDDEN_KEYS.has(it.key));
}
