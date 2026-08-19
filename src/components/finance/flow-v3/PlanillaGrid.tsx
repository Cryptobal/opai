"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Inbox, Plus } from "lucide-react";
import type { FlowMatrixResponse, FlowMatrixRowDto } from "@/modules/finance/flow-v3/matrix-types";
import { hasInvoicedIncome } from "@/modules/finance/flow-v3/cell-editability";
import { addWeeksUTC, toYmd, ymdToDate } from "@/modules/finance/flow-v3/weeks";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  ContextMenu, ContextMenuContent, ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { BP } from "@/lib/breakpoints";
import {
  COL_W, displayValue, GUTTER_CELL, GUTTER_W, isZeroRow, NAME_LEFT, NAME_W, SECTION_H,
  SECTION_LABELS, SECTION_ORDER, TODAY_COL,
} from "./grid-classes";
import { keepZeroFlowRow } from "./keep-zero-row";
import {
  fmtCell, formatThousands, numSizeClass, parseSignedAmount, type NumberFormatMode,
} from "./format";
import { PlanillaHeader } from "./PlanillaHeader";
import { PlanillaRow } from "./PlanillaRow";
import { BalanceRow } from "./BalanceRow";
import { CellLayersPopover, type PopoverState } from "./CellLayersPopover";
import type { CellHoverCardHandle } from "./CellHoverCard";
import {
  isDesktopCellDetail,
  shouldOpenPinnedDetailOnContextMenu,
  shouldSelectCellOnContextMenu,
  useCellHover,
} from "./useCellHover";
import { FillRightDialog, type FillRightRequest } from "./FillRightDialog";
import { usePlanillaKeyboard, type CellSel } from "./usePlanillaKeyboard";
import {
  cellKey, cellsInRect, discreteStats, isInRect, isSingleCell, rangeRect, rangeToTsv, toggleDiscreteCell,
  type DiscreteSelStats, type RangeSel,
} from "./range-sel";
import { MenuItems } from "./menu-render";
import {
  buildCellMenu, buildCellSheetModel, buildRowMenu, extractRowTemplates,
  panelActionsFromCellMenu,
  type FolioSheetGroup, type RowTemplate,
} from "./menu-builders";
import {
  ChangeAccountsDialog, ChangeSectionDialog, DeferTermDialog, DiasCobroDialog,
} from "./RowDialogs";
import { RecurringExpenseDialog } from "./RecurringExpenseDialog";
import { CellActionSheet } from "./CellActionSheet";
import { SumPill } from "./SumPill";
import { UnmatchedIncomeList } from "./UnmatchedIncomeList";
import type { HistoryEntry } from "./usePlanillaHistory";
import type { usePlanillaActions } from "./usePlanillaActions";
import type { CellDragPayload } from "./cell-drag";
import type { CellStyle } from "./usePlanillaViewPrefs";
import {
  bandejaBadgeText,
  bandejaBadgeTitle,
  collectBandejaGroups,
  isFallbackBandejaRow,
  summarizeBandejaRow,
  type BandejaGroup,
} from "@/modules/finance/flow-v3/unmatched-count";
import {
  BandejaGroupList,
  type BandejaApplyItem,
} from "./BandejaGroupList";
import { learnRuleForSuggestionSource } from "./bandeja-suggestions";
import { rowHasCeded, rowHasOverdue } from "./cell-meta";
import { CobranzaSendDialog } from "@/components/finance/cobranza/CobranzaSendDialog";

interface PlanMutators {
  patchPlan: (rowId: string, weekStart: string, amount: number, opts?: { skipHistory?: boolean }) => Promise<void>;
  patchPlanBulk: (rowId: string, weekStarts: string[], amount: number, opts?: { skipHistory?: boolean }) => Promise<unknown>;
  movePlan: (rowId: string, from: string, to: string, opts?: { skipHistory?: boolean }) => Promise<unknown>;
  patchCellNote: (
    rowId: string,
    weekStart: string,
    body: string | null,
    opts?: { silent?: boolean; applyToFuturePlanCells?: boolean },
  ) => Promise<boolean>;
  patchSettlement: (
    rowId: string,
    weekStart: string,
    mode: "AUTO" | "CLOSED",
    projectedClp?: number,
    opts?: { skipHistory?: boolean },
  ) => Promise<void>;
  moveResidual: (
    rowId: string,
    fromWeek: string,
    toWeek: string,
    residualCash: number,
    section: string,
    projectedClp?: number,
    opts?: { skipHistory?: boolean },
  ) => Promise<void>;
  patchBalanceAnchor: (weekStart: string, balanceClp: number | null) => Promise<void>;
  undo: () => Promise<HistoryEntry | null>;
  redo: () => Promise<HistoryEntry | null>;
}

interface Props {
  data: FlowMatrixResponse;
  canManage: boolean;
  matrix: PlanMutators;
  actions: ReturnType<typeof usePlanillaActions>;
  /** Archivar dispara el flujo de confirmación del cliente (warning de programación). */
  onArchive: (row: FlowMatrixRowDto) => void;
  enableDrag: boolean;
  showZeros: boolean;
  /** Solo filas con al menos un DTE en mora. */
  moraFilter?: boolean;
  /** Solo filas con al menos un DTE cedido. */
  cededFilter?: boolean;
  alwaysVisibleRowIds?: Set<string>;
  scrollerRef?: React.RefObject<HTMLDivElement | null>;
  showChips?: boolean;
  numberFormat?: NumberFormatMode;
  getCellStyle?: (rowId: string, weekStart: string) => CellStyle | undefined;
  /** Umbral |delta| para chip ▲/▼ de desviación (default 100000). */
  driftAlertThresholdClp?: number;
  /** Notifica selección al chrome (fx bar / statusbar). */
  onSelectionChange?: (sel: CellSel | null, meta: {
    rowNumber: number;
    rowName: string;
    colIdx: number;
    weekStart: string;
    isBalance?: "flow" | "balance";
    range: RangeSel | null;
    visibleRowIds: string[];
    canEditPlan?: boolean;
    editReason?: string;
  } | null) => void;
  searchQuery?: string;
  /** Expone API de colapso al toolbar. */
  collapseApiRef?: React.MutableRefObject<{ expandAll: () => void; collapseAll: () => void } | null>;
  /** Expone apertura de bandeja (egresos/ingresos) al chrome. */
  bandejaApiRef?: React.MutableRefObject<{
    openUnmatchedAssigner: (section: string) => void;
  } | null>;
  /** Solicitud externa de abrir bandeja GAV (toolbar / menubar). */
  openBandejaRequest?: number;
  /** Solicitud externa de abrir popover de capas (fx bar / Espacio). */
  openLayersRequest?: number;
  /** Copiar rango (⌘C) — el cliente serializa TSV. */
  onCopyRange?: (tsv: string) => void;
  nameW?: number;
  onNameWChange?: (w: number) => void;
  /** Orden por monto (sesión): null = A→Z del servidor. */
  amountSort?: { weekStart: string; dir: "asc" | "desc" } | null;
  /** Modo Σ: selección discontinua por tap / Ctrl+click. */
  sumMode?: boolean;
  onSumModeChange?: (on: boolean) => void;
  /** Stats del set discontinuo → statusbar desktop. */
  onDiscreteStats?: (stats: DiscreteSelStats | null) => void;
  /** Refetch de matriz (tras crear fila desde Otros ingresos). */
  onRefresh?: () => void;
  /** Abre el drawer de detalle del DTE emitido (in-place). */
  onViewDte?: (dteId: string) => void;
  /** Catálogo EXPENSE para el diálogo de recurrencia (Nueva fila → Categoría). */
  expenseCategories?: Array<{ id: string; code: string; name: string; kind: string }>;
  /** Abre "Agregar concepto" con la sección del encabezado prefijada. */
  onAddInSection?: (section: string) => void;
  /**
   * Tras crear fila con "Configurar recurrencia": id de la fila a abrir
   * en RecurringExpenseDialog (espera a que aparezca en `data.rows`).
   */
  openRecurringRowId?: string | null;
  onRecurringOpened?: () => void;
}

type RowDialogState =
  | { kind: "section"; row: FlowMatrixRowDto }
  | { kind: "accounts"; row: FlowMatrixRowDto }
  | { kind: "defer"; row: FlowMatrixRowDto; template: RowTemplate }
  | { kind: "dias"; row: FlowMatrixRowDto; template: RowTemplate }
  | { kind: "recurring"; row: FlowMatrixRowDto }
  | { kind: "delete"; row: FlowMatrixRowDto }
  | { kind: "deleteBlocked"; row: FlowMatrixRowDto; reason: string }
  | null;

type CtxTarget = { kind: "cell"; sel: CellSel } | { kind: "row"; rowId: string } | null;

/** Semana de anclaje al abrir/"Hoy": la ANTERIOR a la actual como primera columna. */
export function anchorTargetWeek(data: FlowMatrixResponse): string {
  const idx = data.columns.findIndex((c) => c.isCurrent);
  return data.columns[Math.max(0, idx - 1)]?.key ?? data.currentWeek;
}

export function scrollToWeek(el: HTMLElement, weekStart: string, smooth = true) {
  const th =
    el.querySelector<HTMLElement>(`[data-week="${weekStart}"]`) ??
    el.querySelector<HTMLElement>(`[data-week][data-current="true"]`);
  if (!th) return;
  const frozen =
    (el.querySelector<HTMLElement>("[data-plnx-corner]")?.offsetWidth ?? 0) +
    (el.querySelector<HTMLElement>("[data-plnx-cola]")?.offsetWidth ?? 0);
  el.scrollTo({ left: Math.max(0, th.offsetLeft - frozen), behavior: smooth ? "smooth" : "auto" });
}

export function PlanillaGrid({
  data, canManage, matrix, actions, onArchive, enableDrag,
  showZeros, moraFilter = false, cededFilter = false, alwaysVisibleRowIds, scrollerRef,
  showChips, numberFormat, getCellStyle, onSelectionChange,
  searchQuery, collapseApiRef, bandejaApiRef, openBandejaRequest, openLayersRequest,
  onCopyRange, nameW, onNameWChange, amountSort,
  sumMode = false, onSumModeChange, onDiscreteStats, onRefresh, onViewDte,
  driftAlertThresholdClp,
  expenseCategories,
  onAddInSection,
  openRecurringRowId = null,
  onRecurringOpened,
}: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  /** Filas en cero reveladas al tocar "n/m" del encabezado de sección. */
  const [revealedZeroRowIds, setRevealedZeroRowIds] = useState<Set<string>>(() => new Set());
  const [popover, setPopover] = useState<PopoverState | null>(null);
  const [popoverFocusNote, setPopoverFocusNote] = useState(false);
  const [fillRight, setFillRight] = useState<FillRightRequest | null>(null);
  const [renamingRowId, setRenamingRowId] = useState<string | null>(null);
  const [rowDialog, setRowDialog] = useState<RowDialogState>(null);
  const [ctxTarget, setCtxTarget] = useState<CtxTarget>(null);
  const [sheetTarget, setSheetTarget] = useState<CtxTarget>(null);
  const [bandejaRutSection, setBandejaRutSection] = useState<string | null>(null);
  /** Panel "Facturas sin fila" (DTEs emitidos unrouted). */
  const [unroutedOpen, setUnroutedOpen] = useState(false);
  /** DTE a enfocar en el picker "Vincular a programación…" del drill. */
  const [linkFocusDteId, setLinkFocusDteId] = useState<string | null>(null);
  const [discreteSel, setDiscreteSel] = useState<Map<string, number>>(() => new Map());
  const [dropTarget, setDropTarget] = useState<{ rowId: string; colIdx: number } | null>(null);
  const dragRef = useRef<{
    rowId: string;
    week: string;
    payload: CellDragPayload;
  } | null>(null);
  const localRef = useRef<HTMLDivElement | null>(null);
  const scroller = scrollerRef ?? localRef;
  const kbRef = useRef<ReturnType<typeof usePlanillaKeyboard> | null>(null);
  const hoverRef = useRef<CellHoverCardHandle | null>(null);
  const [cobranzaTarget, setCobranzaTarget] = useState<{
    dteId: string;
    crmAccountId: string | null;
    daysOverdue: number;
  } | null>(null);

  const rowById = useMemo(() => new Map(data.rows.map((r) => [r.id, r])), [data.rows]);
  const closedSet = useMemo(() => new Set(data.closedWeeks), [data.closedWeeks]);
  const bandejaIncomeSummary = useMemo(
    () => summarizeBandejaRow(data.rows, "INGRESOS"),
    [data.rows],
  );
  const bandejaExpenseSummary = useMemo(
    () => summarizeBandejaRow(data.rows, "GAV"),
    [data.rows],
  );
  const bandejaIncomeBadge = useMemo(
    () => bandejaBadgeText(bandejaIncomeSummary, "INGRESOS"),
    [bandejaIncomeSummary],
  );
  const bandejaExpenseBadge = useMemo(
    () => bandejaBadgeText(bandejaExpenseSummary, "GAV"),
    [bandejaExpenseSummary],
  );
  const bandejaIncomeTitle = useMemo(
    () => bandejaBadgeTitle(bandejaIncomeSummary, "INGRESOS"),
    [bandejaIncomeSummary],
  );
  const bandejaExpenseTitle = useMemo(
    () => bandejaBadgeTitle(bandejaExpenseSummary, "GAV"),
    [bandejaExpenseSummary],
  );
  const bandejaGroups = useMemo(
    () => (bandejaRutSection ? collectBandejaGroups(data.rows, bandejaRutSection) : []),
    [data.rows, bandejaRutSection],
  );
  const bandejaFlowRows = useMemo(() => {
    const expenseSections = new Set(["GAV", "OTROS", "IMPUESTOS", "FINANCIAMIENTO", "REMUNERACIONES"]);
    return data.rows
      .filter((r) => {
        if (r.isVirtual || r.isArchived || isFallbackBandejaRow(r)) return false;
        if (bandejaRutSection === "INGRESOS") return r.section === "INGRESOS";
        return expenseSections.has(r.section);
      })
      .map((r) => ({
        id: r.id,
        name: r.name,
        section: r.section,
        hasAccounts:
          r.mapping === "ACCOUNTS" ||
          r.mapping === "CATEGORY" ||
          r.categoryId != null,
      }));
  }, [data.rows, bandejaRutSection]);
  const recurringRows = useMemo(
    () =>
      data.rows.filter(
        (r) =>
          !r.isArchived
          && ["REMUNERACIONES", "IMPUESTOS", "GAV", "OTROS", "FINANCIAMIENTO"].includes(r.section),
      ),
    [data.rows],
  );

  // Encadena AddRowDialog → RecurringExpenseDialog (v5.2).
  useEffect(() => {
    if (!openRecurringRowId) return;
    const row = rowById.get(openRecurringRowId);
    if (!row) return;
    setRowDialog({ kind: "recurring", row });
    onRecurringOpened?.();
  }, [openRecurringRowId, rowById, onRecurringOpened]);

  /** Abre bandeja cartola (RUT) o asignador DTE legacy según sección. */
  const openUnmatchedAssigner = useCallback(
    (section: string, focusDteId?: string | null) => {
      const summary = summarizeBandejaRow(data.rows, section);
      if (summary.totalClp > 0 || summary.distinctGroupCount > 0) {
        setBandejaRutSection(section);
        return;
      }
      if (section !== "INGRESOS") return;
      for (const row of data.rows) {
        if (!isFallbackBandejaRow(row) || row.section !== section) continue;
        for (let colIdx = 0; colIdx < row.cells.length; colIdx++) {
          const cell = row.cells[colIdx]!;
          const items = (cell.committed?.items ?? []).filter((i) => i.kind === "dte");
          if (items.length === 0) continue;
          if (focusDteId && !items.some((i) => i.dteId === focusDteId)) continue;
          setSheetTarget({ kind: "cell", sel: { rowId: row.id, colIdx } });
          setLinkFocusDteId(focusDteId ?? null);
          return;
        }
      }
      if (focusDteId) {
        for (const row of data.rows) {
          if (!isFallbackBandejaRow(row) || row.section !== section) continue;
          for (let colIdx = 0; colIdx < row.cells.length; colIdx++) {
            const cell = row.cells[colIdx]!;
            const n = (cell.committed?.items ?? []).filter((i) => i.kind === "dte").length;
            if (n > 0) {
              setSheetTarget({ kind: "cell", sel: { rowId: row.id, colIdx } });
              setLinkFocusDteId(focusDteId);
              return;
            }
          }
        }
      }
    },
    [data.rows],
  );

  const handleClassifyGroup = useCallback(
    async (args: {
      group: BandejaGroup;
      flowRowId: string;
      needle: string | null;
      bankTransactionIds?: string[];
      learnRule?: "RUT" | "DESCRIPTION" | "NONE";
    }) => {
      const { group, flowRowId, needle } = args;
      const ids =
        args.bankTransactionIds ??
        group.items.map((i) => i.bankTransactionId);
      if (ids.length === 0) return;

      const destRow = rowById.get(flowRowId);
      const destHasAccounts =
        destRow &&
        (destRow.mapping === "ACCOUNTS" ||
          destRow.mapping === "CATEGORY" ||
          destRow.categoryId != null);
      if (destRow && !destHasAccounts) {
        throw new Error(
          "El renglón destino no tiene cuentas; asigná cuentas contables antes de clasificar.",
        );
      }

      const BATCH = 200;
      let classifiedTotal = 0;
      let skippedLinked = 0;
      let rulesLearned = 0;
      let ruleId: string | null = null;
      const learnRule =
        args.learnRule ??
        (group.kind === "RUT"
          ? "RUT"
          : group.kind === "MERCHANT"
            ? "DESCRIPTION"
            : "NONE");

      for (let offset = 0; offset < ids.length; offset += BATCH) {
        const chunk = ids.slice(offset, offset + BATCH);
        const first = chunk[0]!;
        const also = chunk.slice(1);
        const body: Record<string, unknown> = {
          kind: "FLOW_ROW",
          flowRowId,
          alsoBankTransactionIds: also,
          learnRule: offset === 0 ? learnRule : "NONE",
        };
        if (offset === 0 && learnRule === "DESCRIPTION" && needle) {
          body.descriptionNeedle = needle;
        }
        const res = await fetch(
          `/api/finance/banking/transactions/${first}/classify-suggestions`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
        );
        const j = await res.json();
        if (!res.ok || !j.success) throw new Error(j.error ?? "Error al clasificar");
        classifiedTotal += Number(j.data?.classified ?? 0);
        const errors = (j.data?.errors ?? []) as Array<{ id: string; message: string }>;
        skippedLinked += errors.filter((e) =>
          /ya tiene vínculos|no se sobrescribe/i.test(e.message),
        ).length;
        if (j.data?.ruleId) {
          ruleId = j.data.ruleId as string;
          rulesLearned += 1;
        }
      }

      let autoMatched = 0;
      let reachedCap = false;
      if (ruleId) {
        const run = await fetch("/api/finance/banking/automatch-rules/run-rules-only", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ruleId }),
        });
        const rj = await run.json();
        if (run.ok && rj.success) {
          autoMatched = Number(rj.data?.autoMatched ?? 0);
          reachedCap = Boolean(rj.data?.reachedCap);
        }
      }

      const parts = [
        `${classifiedTotal} movimiento${classifiedTotal === 1 ? "" : "s"} clasificado${classifiedTotal === 1 ? "" : "s"}`,
      ];
      if (rulesLearned > 0) {
        parts.push(
          `${rulesLearned} regla${rulesLearned === 1 ? "" : "s"} aprendida${rulesLearned === 1 ? "" : "s"}`,
        );
      }
      if (autoMatched > 0) {
        parts.push(
          `${autoMatched} histórico${autoMatched === 1 ? "" : "s"} re-ruteado${autoMatched === 1 ? "" : "s"}`,
        );
      }
      if (skippedLinked > 0) {
        parts.push(
          `${skippedLinked} con vínculos previos omitido${skippedLinked === 1 ? "" : "s"}`,
        );
      }
      if (reachedCap) parts.push("tope de escaneo — volvé a aplicar la regla");
      toast.success(parts.join(" · "));
      setBandejaRutSection(null);
      onRefresh?.();
    },
    [onRefresh, rowById],
  );

  const handleApplySuggestions = useCallback(
    async (items: BandejaApplyItem[]) => {
      if (items.length === 0) return;

      // Filtrar destinos hacia renglones sin cuentas.
      const eligible: BandejaApplyItem[] = [];
      let skippedNoAccounts = 0;
      for (const it of items) {
        const row = rowById.get(it.flowRowId);
        const hasAccounts =
          row &&
          (row.mapping === "ACCOUNTS" ||
            row.mapping === "CATEGORY" ||
            row.categoryId != null);
        if (!row || !hasAccounts) {
          skippedNoAccounts += 1;
          continue;
        }
        eligible.push(it);
      }
      if (skippedNoAccounts > 0) {
        toast.message(
          `${skippedNoAccounts} movimiento${skippedNoAccounts === 1 ? "" : "s"} quedaron fuera: el renglón destino no tiene cuentas`,
        );
      }
      if (eligible.length === 0) {
        throw new Error(
          "Ningún movimiento tiene un renglón destino con cuentas asignadas",
        );
      }

      // Agrupar por flowRowId + learnRule (nómina/TE → NONE).
      const buckets = new Map<string, BandejaApplyItem[]>();
      for (const it of eligible) {
        const lr = learnRuleForSuggestionSource(it.source);
        const key = `${it.flowRowId}::${lr}`;
        const list = buckets.get(key) ?? [];
        list.push(it);
        buckets.set(key, list);
      }

      const BATCH = 200;
      let classifiedTotal = 0;
      let rulesLearned = 0;
      let skippedLinked = 0;
      let autoMatched = 0;
      let reachedCap = false;
      const ruleIds = new Set<string>();

      for (const [key, bucket] of buckets) {
        const [flowRowId, learnRule] = key.split("::") as [
          string,
          "NONE" | "RUT" | "DESCRIPTION",
        ];
        const ids = bucket.map((b) => b.bankTransactionId);
        for (let offset = 0; offset < ids.length; offset += BATCH) {
          const chunk = ids.slice(offset, offset + BATCH);
          const first = chunk[0]!;
          const also = chunk.slice(1);
          const body: Record<string, unknown> = {
            kind: "FLOW_ROW",
            flowRowId,
            alsoBankTransactionIds: also,
            learnRule: offset === 0 ? learnRule : "NONE",
          };
          const res = await fetch(
            `/api/finance/banking/transactions/${first}/classify-suggestions`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            },
          );
          const j = await res.json();
          if (!res.ok || !j.success) {
            throw new Error(j.error ?? "Error al clasificar sugerencias");
          }
          classifiedTotal += Number(j.data?.classified ?? 0);
          const errors = (j.data?.errors ?? []) as Array<{
            id: string;
            message: string;
          }>;
          skippedLinked += errors.filter((e) =>
            /ya tiene vínculos|no se sobrescribe/i.test(e.message),
          ).length;
          if (j.data?.ruleId) {
            ruleIds.add(j.data.ruleId as string);
            rulesLearned += 1;
          }
        }
      }

      for (const ruleId of ruleIds) {
        const run = await fetch("/api/finance/banking/automatch-rules/run-rules-only", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ruleId }),
        });
        const rj = await run.json();
        if (run.ok && rj.success) {
          autoMatched += Number(rj.data?.autoMatched ?? 0);
          if (rj.data?.reachedCap) reachedCap = true;
        }
      }

      const parts = [
        `${classifiedTotal} movimientos clasificados`,
        `${rulesLearned} reglas aprendidas`,
        `${autoMatched} históricos re-ruteados`,
      ];
      if (skippedLinked > 0) {
        parts.push(
          `${skippedLinked} con vínculos previos omitido${skippedLinked === 1 ? "" : "s"}`,
        );
      }
      if (reachedCap) parts.push("tope de escaneo — volvé a aplicar la regla");
      toast.success(parts.join(" · "));
      setBandejaRutSection(null);
      onRefresh?.();
    },
    [onRefresh, rowById],
  );

  // Deep-link post-emisión huérfana: /finanzas/flujo-caja/planilla?focusDte=…
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const focus = params.get("focusDte");
    if (!focus) return;
    openUnmatchedAssigner("INGRESOS", focus);
    params.delete("focusDte");
    const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
    window.history.replaceState({}, "", next);
  }, [openUnmatchedAssigner]);

  const normSearch = useMemo(() => {
    const q = (searchQuery ?? "").trim();
    if (!q) return "";
    return q.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  }, [searchQuery]);

  const sections = useMemo(() => {
    const weekIdx = amountSort
      ? data.columns.findIndex((c) => c.weekStart === amountSort.weekStart)
      : -1;
    return SECTION_ORDER.map((s) => {
      const all = data.rows.filter((r) => r.section === s);
      let rows = showZeros
        ? all
        : all.filter(
            (r) =>
              !isZeroRow(r) ||
              keepZeroFlowRow(r) ||
              alwaysVisibleRowIds?.has(r.id) ||
              revealedZeroRowIds.has(r.id),
          );
      if (normSearch) {
        rows = rows.filter((r) =>
          r.name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().includes(normSearch),
        );
      }
      if (moraFilter) {
        rows = rows.filter((r) => rowHasOverdue(r));
      }
      if (cededFilter) {
        rows = rows.filter((r) => rowHasCeded(r));
      }
      if (amountSort && weekIdx >= 0) {
        const dir = amountSort.dir === "desc" ? -1 : 1;
        rows = [...rows].sort((a, b) => {
          if (a.isVirtual !== b.isVirtual) return a.isVirtual ? 1 : -1;
          const va = displayValue(a.section, a.cells[weekIdx]?.layer ?? "empty", a.cells[weekIdx]?.effective ?? 0);
          const vb = displayValue(b.section, b.cells[weekIdx]?.layer ?? "empty", b.cells[weekIdx]?.effective ?? 0);
          return (va - vb) * dir || a.name.localeCompare(b.name, "es", { sensitivity: "base", numeric: true });
        });
      }
      // Subtotales por semana: suma de displayValue de TODAS las filas de la
      // sección (dato, no vista — independiente de colapso/ceros/búsqueda).
      const subtotals = data.columns.map((_, wi) =>
        all.reduce((sum, r) => {
          const cell = r.cells[wi];
          return sum + displayValue(r.section, cell?.layer ?? "empty", cell?.effective ?? 0);
        }, 0),
      );
      const hiddenZeroIds = showZeros
        ? []
        : all
            .filter(
              (r) =>
                isZeroRow(r) &&
                !keepZeroFlowRow(r) &&
                !alwaysVisibleRowIds?.has(r.id) &&
                !revealedZeroRowIds.has(r.id),
            )
            .map((r) => r.id);
      return { key: s, rows, total: all.length, matchCount: rows.length, subtotals, hiddenZeroIds };
    }).filter((s) => (normSearch ? s.matchCount > 0 : s.total > 0));
  }, [data.rows, data.columns, showZeros, moraFilter, cededFilter, alwaysVisibleRowIds, revealedZeroRowIds, normSearch, amountSort]);

  const { numbered, footerStart } = useMemo(() => {
    let n = 1;
    const out = sections.map((sec) => {
      const secNumber = n++;
      const rows = (collapsed.has(sec.key) ? [] : sec.rows).map((row) => ({ row, number: n++ }));
      return { ...sec, secNumber, numberedRows: rows };
    });
    return { numbered: out, footerStart: n };
  }, [sections, collapsed]);

  const rowNumberById = useMemo(() => {
    const m = new Map<string, number>();
    for (const sec of numbered) {
      for (const { row, number } of sec.numberedRows) m.set(row.id, number);
    }
    return m;
  }, [numbered]);

  useEffect(() => {
    if (!collapseApiRef) return;
    collapseApiRef.current = {
      expandAll: () => setCollapsed(new Set()),
      collapseAll: () => setCollapsed(new Set(SECTION_ORDER)),
    };
    return () => { collapseApiRef.current = null; };
  }, [collapseApiRef]);

  useEffect(() => {
    if (!bandejaApiRef) return;
    bandejaApiRef.current = { openUnmatchedAssigner };
    return () => { bandejaApiRef.current = null; };
  }, [bandejaApiRef, openUnmatchedAssigner]);

  const kbData = useMemo(
    () => ({ ...data, rows: numbered.flatMap((s) => s.numberedRows.map((x) => x.row)) }),
    [data, numbered],
  );

  /** ¿La columna admite escritura de plan? (no cerrada, semanal). */
  const colWritable = useCallback(
    (colIdx: number) => {
      const col = data.columns[colIdx];
      return !!col && data.granularity === "week" && !closedSet.has(col.key);
    },
    [data.columns, data.granularity, closedSet],
  );

  const canEditCell = useCallback(
    (rowId: string, colIdx: number) => {
      const row = rowById.get(rowId);
      if (!row || !canManage || row.isArchived || row.isVirtual || !colWritable(colIdx)) {
        return false;
      }
      const cell = row.cells[colIdx];
      // Ingreso facturado: la factura manda; no se edita el plan encima.
      if (hasInvoicedIncome(row.section, cell?.committed)) return false;
      return true;
    },
    [rowById, canManage, colWritable],
  );

  const commit = useCallback(
    (rowId: string, colIdx: number, raw: string) => {
      const col = data.columns[colIdx];
      if (!col || !canEditCell(rowId, colIdx)) return;
      void matrix.patchPlan(rowId, col.key, parseSignedAmount(raw || "0"));
    },
    [data.columns, canEditCell, matrix],
  );

  /** Prefill del editor (Enter / F2 / doble clic) con plan o monto visible + miles. */
  const getEditSeed = useCallback(
    (sel: CellSel) => {
      const row = rowById.get(sel.rowId);
      const cell = row?.cells[sel.colIdx];
      if (!row || !cell) return "";
      const seed =
        cell.plan !== 0
          ? cell.plan
          : displayValue(row.section, cell.layer, cell.effective);
      return seed !== 0 ? formatThousands(String(Math.round(Math.abs(seed)))) : "";
    },
    [rowById],
  );

  const openPopover = useCallback(
    (sel: CellSel, anchor?: DOMRect, opts?: { focusNote?: boolean }) => {
      const row = rowById.get(sel.rowId);
      const cell = row?.cells[sel.colIdx];
      if (!row || !cell) return;
      const rect =
        anchor ??
        document.querySelector(`[data-rc="${sel.rowId}:${sel.colIdx}"]`)?.getBoundingClientRect();
      if (!rect) return;
      hoverRef.current?.forceHide();
      setPopoverFocusNote(!!opts?.focusNote);
      setPopover({ row, cell, anchor: { left: rect.left, top: rect.top, bottom: rect.bottom } });
    },
    [rowById],
  );

  const requestFillRight = useCallback(
    (sel: CellSel) => {
      const row = rowById.get(sel.rowId);
      const cell = row?.cells[sel.colIdx];
      if (!row || !cell || data.granularity !== "week") return;
      const weeksRight = data.columns
        .slice(sel.colIdx + 1)
        .filter((c) => !closedSet.has(c.key))
        .map((c) => c.key);
      if (weeksRight.length === 0) return;
      setFillRight({
        rowId: row.id, rowName: row.name, fromWeek: cell.weekStart, weeksRight, amount: cell.plan,
      });
    },
    [rowById, data.columns, data.granularity, closedSet],
  );

  // ── Deshacer / rehacer: aplica foco + toast tras la operación del matrix. ──
  const applyHistoryResult = useCallback(
    (entry: HistoryEntry | null, verb: string) => {
      if (!entry) return;
      if (entry.focus) {
        kbRef.current?.setSel(entry.focus);
        const col = data.columns[entry.focus.colIdx];
        if (col && scroller.current) scrollToWeek(scroller.current, col.key);
      }
      setPopover(null);
      toast.message(`${verb}: ${entry.label}`);
    },
    [data.columns, scroller],
  );
  const handleUndo = useCallback(async () => {
    const entry = await matrix.undo();
    if (!entry) { toast.message("Nada que deshacer"); return; }
    applyHistoryResult(entry, "Deshecho");
  }, [matrix, applyHistoryResult]);
  const handleRedo = useCallback(async () => {
    const entry = await matrix.redo();
    if (!entry) { toast.message("Nada que rehacer"); return; }
    applyHistoryResult(entry, "Rehecho");
  }, [matrix, applyHistoryResult]);

  const visibleRowIds = useMemo(
    () => numbered.flatMap((s) => s.numberedRows.map((x) => x.row.id)),
    [numbered],
  );

  const visibleRowIdxById = useMemo(() => {
    const m = new Map<string, number>();
    visibleRowIds.forEach((id, i) => m.set(id, i));
    return m;
  }, [visibleRowIds]);

  const copyRangeTsv = useCallback(() => {
    if (!kbRef.current?.range || !onCopyRange) return;
    const rect = rangeRect(kbRef.current.range, visibleRowIds);
    if (!rect) return;
    const cells = cellsInRect(rect, visibleRowIds);
    const grid: number[][] = [];
    let row: number[] = [];
    let lastR = -1;
    for (const { rowId, colIdx } of cells) {
      const ri = visibleRowIdxById.get(rowId) ?? -1;
      if (lastR >= 0 && ri !== lastR) {
        grid.push(row);
        row = [];
      }
      lastR = ri;
      const r = rowById.get(rowId);
      const cell = r?.cells[colIdx];
      row.push(
        r && cell ? displayValue(r.section, cell.layer, cell.effective) : 0,
      );
    }
    if (row.length) grid.push(row);
    onCopyRange(rangeToTsv(grid));
  }, [onCopyRange, visibleRowIds, visibleRowIdxById, rowById]);

  const clearDiscrete = useCallback(() => {
    setDiscreteSel(new Map());
    onSumModeChange?.(false);
    onDiscreteStats?.(null);
  }, [onSumModeChange, onDiscreteStats]);

  /** Esc: cierra ficha/menú/panel y limpia selección (y Σ si aplica). */
  const handleEscape = useCallback(() => {
    hoverRef.current?.forceHide();
    setPopover(null);
    setPopoverFocusNote(false);
    clearDiscrete();
    kbRef.current?.setSel(null);
  }, [clearDiscrete]);

  const cellEditReason = useCallback(
    (rowId: string, colIdx: number): string => {
      const row = rowById.get(rowId);
      const cell = row?.cells[colIdx];
      const col = data.columns[colIdx];
      if (!row || !cell || !col) return "";
      if (!canManage) return "Sin permiso de edición";
      if (data.granularity !== "week") return "Cambia a vista semanal";
      if (row.isVirtual) return "Fila calculada";
      if (row.isArchived) return "Fila archivada";
      if (closedSet.has(col.key)) return "Semana cerrada";
      if (hasInvoicedIncome(row.section, cell.committed)) {
        return "Ingreso facturado (la factura manda)";
      }
      return "";
    },
    [rowById, data.columns, data.granularity, canManage, closedSet],
  );

  const openNoteEditor = useCallback(
    (sel: CellSel) => {
      kbRef.current?.setSel(sel);
      openPopover(sel, undefined, { focusNote: true });
    },
    [openPopover],
  );

  const kb = usePlanillaKeyboard({
    data: kbData,
    canEditCell,
    onCommit: commit,
    onOpenPopover: (sel) => openPopover(sel),
    onOpenNote: openNoteEditor,
    onFillRight: requestFillRight,
    onUndo: () => void handleUndo(),
    onRedo: () => void handleRedo(),
    onCopy: copyRangeTsv,
    onEscape: handleEscape,
    getEditSeed,
  });
  kbRef.current = kb;

  // Enter / tipeo abren el editor sin pasar por onStartEdit del row.
  useEffect(() => {
    if (kb.isEditing) {
      hoverRef.current?.forceHide();
      setSheetTarget(null);
    }
  }, [kb.isEditing]);

  const resolveHover = useCallback(
    (rowId: string, colIdx: number) => {
      const row = rowById.get(rowId);
      const cell = row?.cells[colIdx];
      if (!row || !cell || row.isVirtual) return null;
      return {
        row,
        cell,
        colIdx,
        rowNumber: rowNumberById.get(rowId) ?? 0,
        isPast: data.granularity === "week" && cell.weekStart < data.currentWeek,
        reason: cellEditReason(rowId, colIdx),
      };
    },
    [rowById, rowNumberById, data.granularity, data.currentWeek, cellEditReason],
  );

  const hoverSuppressed = useCallback(() => {
    return (
      !!kbRef.current?.isEditing ||
      !!dragRef.current ||
      !!sumMode ||
      !!ctxTarget ||
      !!popover
    );
  }, [sumMode, ctxTarget, popover]);

  useCellHover({
    scrollerRef: scroller,
    hoverRef,
    resolve: resolveHover,
    isSuppressed: hoverSuppressed,
  });

  /**
   * Desktop: clic derecho selecciona (si hace falta) y abre el panel único.
   * Clic izquierdo solo cambia de celda.
   */
  const openPinnedCellDetail = useCallback(
    (sel: CellSel) => {
      if (kbRef.current?.isEditing) return;
      if (!isDesktopCellDetail()) return;
      if (!resolveHover(sel.rowId, sel.colIdx)) return;
      setSheetTarget(null);
      openPopover(sel);
    },
    [resolveHover, openPopover],
  );

  const openCaretMenu = useCallback((sel: CellSel) => {
    kbRef.current?.setSel(sel);
    openPopover(sel);
  }, [openPopover]);

  const discreteKeys = useMemo(() => new Set(discreteSel.keys()), [discreteSel]);
  const discreteSelStats = useMemo(() => discreteStats(discreteSel.values()), [discreteSel]);

  useEffect(() => {
    if (!sumMode || discreteSel.size === 0) {
      onDiscreteStats?.(sumMode ? discreteSelStats : null);
      return;
    }
    onDiscreteStats?.(discreteSelStats);
  }, [sumMode, discreteSelStats, discreteSel.size, onDiscreteStats]);

  // Recalcular valores del set Σ cuando cambia la matriz (edición).
  useEffect(() => {
    if (discreteSel.size === 0) return;
    setDiscreteSel((prev) => {
      let changed = false;
      const next = new Map<string, number>();
      for (const [key] of prev) {
        const [rowId, colStr] = key.split(":");
        const colIdx = Number(colStr);
        const row = rowById.get(rowId!);
        const cell = row?.cells[colIdx];
        if (!row || !cell) {
          changed = true;
          continue;
        }
        const v = displayValue(row.section, cell.layer, cell.effective);
        next.set(key, v);
        if (v !== prev.get(key)) changed = true;
      }
      return changed ? next : prev;
    });
  }, [data.rows, rowById, discreteSel.size]);

  const toggleDiscrete = useCallback(
    (sel: CellSel) => {
      const row = rowById.get(sel.rowId);
      const cell = row?.cells[sel.colIdx];
      if (!row || !cell) return;
      const v = displayValue(row.section, cell.layer, cell.effective);
      setDiscreteSel((prev) => toggleDiscreteCell(prev, cellKey(sel.rowId, sel.colIdx), v));
    },
    [rowById],
  );

  const activeRect = useMemo(
    () => (kb.range ? rangeRect(kb.range, visibleRowIds) : null),
    [kb.range, visibleRowIds],
  );

  const selectedColIndices = useMemo(() => {
    const s = new Set<number>();
    if (!activeRect) {
      if (kb.sel) s.add(kb.sel.colIdx);
      return s;
    }
    for (let c = activeRect.c0; c <= activeRect.c1; c++) s.add(c);
    return s;
  }, [activeRect, kb.sel]);

  /** Resalte cruzado estilo Sheets: solo celda única activa. */
  const crossHighlight = useMemo(() => {
    if (!activeRect || !isSingleCell(activeRect) || !kb.sel) return null;
    return kb.sel;
  }, [activeRect, kb.sel]);

  // Propagar selección al chrome (fx / statusbar).
  useEffect(() => {
    if (!onSelectionChange) return;
    const sel = kb.sel;
    if (!sel) { onSelectionChange(null, null); return; }
    const row = rowById.get(sel.rowId);
    const col = data.columns[sel.colIdx];
    if (!row || !col) { onSelectionChange(null, null); return; }
    const reason = cellEditReason(sel.rowId, sel.colIdx);
    onSelectionChange(sel, {
      rowNumber: rowNumberById.get(sel.rowId) ?? 0,
      rowName: row.name,
      colIdx: sel.colIdx,
      weekStart: col.weekStart,
      range: kb.range,
      visibleRowIds,
      canEditPlan: canEditCell(sel.rowId, sel.colIdx),
      editReason: reason,
    });
  }, [kb.sel, kb.range, onSelectionChange, rowById, data.columns, rowNumberById, visibleRowIds, cellEditReason, canEditCell]);

  // Abrir capas desde fx bar / atajo externo.
  const lastLayersReq = useRef(0);
  useEffect(() => {
    if (!openLayersRequest || openLayersRequest === lastLayersReq.current) return;
    lastLayersReq.current = openLayersRequest;
    if (kb.sel) openPopover(kb.sel);
  }, [openLayersRequest, kb.sel, openPopover]);

  // Abrir bandeja GAV desde toolbar / menubar (p.ej. tras volver de vista Panel).
  const lastBandejaReq = useRef(0);
  useEffect(() => {
    if (!openBandejaRequest || openBandejaRequest === lastBandejaReq.current) return;
    lastBandejaReq.current = openBandejaRequest;
    openUnmatchedAssigner("GAV");
  }, [openBandejaRequest, openUnmatchedAssigner]);

  /** Semana abierta: se puede soltar F°/P aunque la celda ya tenga factura. */
  const canMoveCommitted = useCallback(
    (rowId: string, colIdx: number) => {
      const row = rowById.get(rowId);
      const col = data.columns[colIdx];
      return (
        !!row &&
        !!col &&
        canManage &&
        !row.isArchived &&
        !row.isVirtual &&
        data.granularity === "week" &&
        !closedSet.has(col.key)
      );
    },
    [rowById, data.columns, data.granularity, canManage, closedSet],
  );

  // ── Drag & drop: plan, F° o P (cada uno por separado). ──
  const onCellDragStart = useCallback((rowId: string, week: string, payload: CellDragPayload) => {
    dragRef.current = { rowId, week, payload };
  }, []);
  const onCellDragOver = useCallback(
    (e: React.DragEvent, rowId: string, colIdx: number, week: string) => {
      const src = dragRef.current;
      if (!src || src.rowId !== rowId || src.week === week) return;
      const ok =
        src.payload.kind === "plan"
          ? canEditCell(rowId, colIdx)
          : canMoveCommitted(rowId, colIdx);
      if (!ok) return;
      e.preventDefault();
      setDropTarget((t) => (t?.rowId === rowId && t.colIdx === colIdx ? t : { rowId, colIdx }));
    },
    [canEditCell, canMoveCommitted],
  );
  const onCellDrop = useCallback(
    (rowId: string, week: string) => {
      const src = dragRef.current;
      dragRef.current = null;
      setDropTarget(null);
      if (!src || src.rowId !== rowId || src.week === week) return;
      if (src.payload.kind === "plan") {
        void matrix.movePlan(rowId, src.week, week);
        return;
      }
      if (src.payload.kind === "scheduled") {
        void actions.moveScheduled(src.payload.templateId, src.payload.billingPeriod, week);
        return;
      }
      if (src.payload.kind === "milestone") {
        void actions.moveMilestone(src.payload.milestoneKey, src.payload.billingPeriod, week);
        return;
      }
      void actions.moveDte(src.payload.dteId, week);
    },
    [matrix, actions],
  );
  const onCellDragEnd = useCallback(() => {
    dragRef.current = null;
    setDropTarget(null);
  }, []);

  // ── Callbacks de menú de fila / celda. ──
  const rowCallbacks = useMemo(
    () => ({
      onRename: (row: FlowMatrixRowDto) => setRenamingRowId(row.id),
      onRestoreName: (row: FlowMatrixRowDto) => {
        if (!row.sourceName) return;
        void actions.renameRow(row.id, row.sourceName);
      },
      onChangeSection: (row: FlowMatrixRowDto) => setRowDialog({ kind: "section", row }),
      onChangeAccounts: (row: FlowMatrixRowDto) => setRowDialog({ kind: "accounts", row }),
      onDeferTerm: (row: FlowMatrixRowDto, template: RowTemplate) => setRowDialog({ kind: "defer", row, template }),
      onSetDiasCobro: (row: FlowMatrixRowDto, template: RowTemplate) => setRowDialog({ kind: "dias", row, template }),
      onRecurring: (row: FlowMatrixRowDto) => setRowDialog({ kind: "recurring", row }),
      onArchive,
      onUnarchive: (row: FlowMatrixRowDto) => void actions.unarchiveRow(row.id),
      onDelete: (row: FlowMatrixRowDto) => setRowDialog({ kind: "delete", row }),
    }),
    [actions, onArchive],
  );

  const cellCallbacksFor = useCallback(
    (sel: CellSel, week: string) => ({
      onEditAmount: () => {
        setPopover(null);
        kb.setSel(sel);
        const row = rowById.get(sel.rowId);
        const cell = row?.cells[sel.colIdx];
        // Prefill con el plan actual; si no hay, con el monto visible (proyección).
        const seed =
          cell && row
            ? cell.plan !== 0
              ? cell.plan
              : displayValue(row.section, cell.layer, cell.effective)
            : 0;
        const initial =
          seed !== 0 ? formatThousands(String(Math.round(Math.abs(seed)))) : "";
        kb.startEdit(sel, initial);
      },
      onFillRight: () => requestFillRight(sel),
      onClearPlan: () => void matrix.patchPlan(sel.rowId, week, 0),
      onMovePlan: (target: string) => void matrix.movePlan(sel.rowId, week, target),
      onMoveParametricCommitted: (target: string) => {
        const row = rowById.get(sel.rowId);
        const cell = row?.cells[sel.colIdx];
        if (!row || !cell) return;
        const mag = Math.round(Math.abs(cell.committed?.total ?? cell.effective ?? 0));
        if (mag === 0) return;
        // FINANCIAMIENTO: plan signado (egreso −). Resto: magnitud positiva (planCashSign niega).
        const amount = row.section === "FINANCIAMIENTO" ? -mag : mag;
        void (async () => {
          await matrix.patchPlan(sel.rowId, week, 0);
          await matrix.patchPlan(sel.rowId, target, amount);
        })();
      },
      onMoveDte: (dteId: string, targetWeek: string) => {
        void actions.moveDte(dteId, targetWeek);
      },
      onMoveScheduled: (templateId: string, billingPeriod: string, targetWeek: string) => {
        void actions.moveScheduled(templateId, billingPeriod, targetWeek);
      },
      onMoveMilestone: (milestoneKey: string, billingPeriod: string, targetWeek: string) => {
        void actions.moveMilestone(milestoneKey, billingPeriod, targetWeek);
      },
      onViewDetail: () => openPopover(sel),
      onEditNote: canManage ? () => openPopover(sel, undefined, { focusNote: true }) : undefined,
      onViewDte: (dteId: string) => onViewDte?.(dteId),
      onLinkTemplate: (dteId: string) => {
        setLinkFocusDteId(dteId);
        setSheetTarget({ kind: "cell", sel });
      },
      onExcludeDte: (dteId: string) => {
        void actions.excludeDte(dteId, "Excluida desde la planilla");
      },
      onRegisterPayment: (dteId: string) => onViewDte?.(dteId),
      onSettleCell: () => {
        const row = rowById.get(sel.rowId);
        const cell = row?.cells[sel.colIdx];
        if (!cell?.execution) return;
        void matrix.patchSettlement(
          sel.rowId,
          week,
          "CLOSED",
          cell.execution.projected,
        );
      },
      onReopenCell: () => {
        void matrix.patchSettlement(sel.rowId, week, "AUTO");
      },
      onMatchPlanToReal: () => {
        const row = rowById.get(sel.rowId);
        const cell = row?.cells[sel.colIdx];
        if (!row || !cell?.real) return;
        const realSigned = cell.real.total;
        const amount =
          row.section === "FINANCIAMIENTO"
            ? Math.round(realSigned)
            : Math.round(Math.abs(realSigned));
        void matrix.patchPlan(sel.rowId, week, amount);
      },
      onMoveResidual: () => {
        const row = rowById.get(sel.rowId);
        const cell = row?.cells[sel.colIdx];
        if (!row || !cell?.execution || cell.execution.residual === 0) return;
        const from = ymdToDate(week);
        if (!from) return;
        const toWeek = toYmd(addWeeksUTC(from, 1));
        void matrix.moveResidual(
          sel.rowId,
          week,
          toWeek,
          cell.execution.residual,
          row.section,
          cell.execution.projected,
        );
      },
      onSendCobranza: canManage
        ? (args: { dteId: string; crmAccountId: string | null; daysOverdue: number }) =>
            setCobranzaTarget(args)
        : undefined,
    }),
    [actions, canManage, kb, matrix, openPopover, requestFillRight, onViewDte, rowById],
  );

  const rowMenuFor = useCallback(
    (row: FlowMatrixRowDto) => buildRowMenu(row, extractRowTemplates(row), rowCallbacks),
    [rowCallbacks],
  );

  const menuItemsFor = useCallback(
    (target: CtxTarget) => {
      if (!target) return null;
      if (target.kind === "row") {
        const row = rowById.get(target.rowId);
        return row ? rowMenuFor(row) : null;
      }
      const { rowId, colIdx } = target.sel;
      const row = rowById.get(rowId);
      const cell = row?.cells[colIdx];
      const col = data.columns[colIdx];
      if (!row || !cell || !col) return null;
      const editable = canEditCell(rowId, colIdx);
      const reason = !canManage
        ? "Sin permiso de edición"
        : data.granularity !== "week"
          ? "Cambia a vista semanal"
          : row.isVirtual
            ? "Fila calculada"
            : row.isArchived
              ? "Fila archivada"
              : closedSet.has(col.key)
                ? "Semana cerrada"
                : hasInvoicedIncome(row.section, cell.committed)
                  ? "Ingreso facturado (la factura manda)"
                  : "";
      const openWeeks = data.columns.filter((_, i) => i !== colIdx && canEditCell(rowId, i));
      const dteMoveWeeks = data.columns.filter(
        (c, i) =>
          i !== colIdx &&
          data.granularity === "week" &&
          !closedSet.has(c.key) &&
          !row.isArchived &&
          !row.isVirtual,
      );
      return buildCellMenu(
        row,
        cell,
        {
          editable,
          reason,
          openWeeks,
          dteMoveWeeks,
          canManage,
          rowName: row.name,
          currentWeek: data.currentWeek,
          cellWeekStart: col.weekStart,
        },
        cellCallbacksFor(target.sel, col.key),
      );
    },
    [rowById, data.columns, data.granularity, canEditCell, canManage, closedSet, rowMenuFor, cellCallbacksFor],
  );

  const ctxItems = useMemo(() => menuItemsFor(ctxTarget), [menuItemsFor, ctxTarget]);
  const popoverActions = useMemo(() => {
    if (!popover) return [];
    const colIdx = data.columns.findIndex((c) => c.key === popover.cell.weekStart);
    if (colIdx < 0) return [];
    return panelActionsFromCellMenu(
      menuItemsFor({ kind: "cell", sel: { rowId: popover.row.id, colIdx } }) ?? [],
    );
  }, [popover, data.columns, menuItemsFor]);
  const sheetRow = sheetTarget?.kind === "row"
    ? rowById.get(sheetTarget.rowId) ?? null
    : sheetTarget?.kind === "cell"
      ? rowById.get(sheetTarget.sel.rowId) ?? null
      : null;
  const sheetCell = sheetTarget?.kind === "cell"
    ? sheetRow?.cells[sheetTarget.sel.colIdx] ?? null
    : null;
  const sheetWeekLabel = sheetTarget?.kind === "cell"
    ? data.columns[sheetTarget.sel.colIdx]?.label
    : undefined;

  const sheetModel = useMemo(() => {
    if (!sheetTarget) return { items: [] as ReturnType<typeof buildCellMenu>, folioGroups: [] as FolioSheetGroup[] };
    if (sheetTarget.kind === "row") {
      return { items: menuItemsFor(sheetTarget) ?? [], folioGroups: [] as FolioSheetGroup[] };
    }
    const row = sheetRow;
    const cell = sheetCell;
    const col = data.columns[sheetTarget.sel.colIdx];
    if (!row || !cell || !col) {
      return { items: [], folioGroups: [] as FolioSheetGroup[] };
    }
    const editable = canEditCell(row.id, sheetTarget.sel.colIdx);
    const reason = !canManage
      ? "Sin permiso de edición"
      : data.granularity !== "week"
        ? "Cambia a vista semanal"
        : row.isVirtual
          ? "Fila calculada"
          : row.isArchived
            ? "Fila archivada"
            : closedSet.has(col.key)
              ? "Semana cerrada"
              : hasInvoicedIncome(row.section, cell.committed)
                ? "Ingreso facturado (la factura manda)"
                : "";
    const openWeeks = data.columns.filter(
      (_, i) => i !== sheetTarget.sel.colIdx && canEditCell(row.id, i),
    );
    const dteMoveWeeks = data.columns.filter(
      (c, i) =>
        i !== sheetTarget.sel.colIdx &&
        data.granularity === "week" &&
        !closedSet.has(c.key) &&
        !row.isArchived &&
        !row.isVirtual,
    );
    const model = buildCellSheetModel(
      row,
      cell,
      {
        editable,
        reason,
        openWeeks,
        dteMoveWeeks,
        canManage,
        rowName: row.name,
        currentWeek: data.currentWeek,
        cellWeekStart: col.weekStart,
      },
      cellCallbacksFor(sheetTarget.sel, col.key),
    );
    return { items: model.commonItems, folioGroups: model.folioGroups };
  }, [
    sheetTarget, sheetRow, sheetCell, data.columns, data.granularity,
    canEditCell, canManage, closedSet, cellCallbacksFor, menuItemsFor,
  ]);
  const sheetItems = sheetModel.items;
  const sheetFolioGroups = sheetModel.folioGroups;

  const anchoredRef = useRef(false);
  useEffect(() => {
    if (anchoredRef.current || data.granularity !== "week") return;
    const el = scroller.current;
    if (!el) return;
    anchoredRef.current = true;
    if (window.matchMedia(`(max-width: ${BP.md - 1}px)`).matches) {
      scrollToWeek(el, anchorTargetWeek(data), false);
    }
  }, [data, scroller]);

  const toggleSection = (s: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });

  const busy = actions.busy;

  return (
    <>
      {/* modal={false}: un ContextMenu modal pone `pointer-events:none` en <body>
          mientras está abierto y lo restaura al cerrar desde el efecto de
          desmontaje de su Content. Como el Content se renderiza condicionalmente
          (depende de ctxItems), al cerrar se desmontaba antes de restaurar y la
          página quedaba congelada hasta refrescar. No-modal elimina ese bloqueo
          (el menú igual se cierra con click afuera / Escape). */}
      <ContextMenu modal={false}>
        <ContextMenuTrigger asChild>
          <div
            ref={scroller}
            tabIndex={0}
            data-micro-type
            onKeyDown={kb.onGridKeyDown}
            onContextMenuCapture={() => setCtxTarget(null)}
            className="planilla-grid-scroll relative max-h-[var(--plnx-grid-h)] overflow-auto overscroll-contain [-webkit-overflow-scrolling:touch] rounded-lg border border-ds-border-default bg-ds-surface-1 outline-none focus-visible:ring-1 focus-visible:ring-primary/40 max-lg:rounded-none max-lg:border-x-0"
            onScroll={() => {
              if (popover) setPopover(null);
            }}
          >
            <table className="w-max border-separate border-spacing-0">
              <PlanillaHeader
                columns={data.columns}
                granularity={data.granularity}
                closedWeeks={data.closedWeeks}
                selectedColIndices={selectedColIndices}
                onSelectCol={(i) => { setPopover(null); kb.selectCol(i); }}
                onSelectAll={() => { setPopover(null); kb.selectAll(); }}
                allSelected={
                  !!activeRect &&
                  activeRect.r0 === 0 &&
                  activeRect.r1 === visibleRowIds.length - 1 &&
                  activeRect.c0 === 0 &&
                  activeRect.c1 === data.columns.length - 1 &&
                  visibleRowIds.length > 0 &&
                  data.columns.length > 0
                }
                sortBy={amountSort}
                nameW={nameW}
                onNameWChange={onNameWChange}
                onNameWAutoFit={() => {
                  // Autoajuste: máximo truncado visible ≤ 320.
                  let max = 140;
                  for (const id of visibleRowIds) {
                    const name = rowById.get(id)?.name ?? "";
                    max = Math.max(max, Math.min(320, 24 + name.length * 7));
                  }
                  onNameWChange?.(max);
                }}
              />
              {numbered.length === 0 && normSearch ? (
                <tbody>
                  <tr>
                    <td
                      colSpan={data.columns.length + 2}
                      className="px-4 py-8 text-center text-sm text-ds-text-3"
                    >
                      Sin conceptos que coincidan
                    </td>
                  </tr>
                </tbody>
              ) : null}
              {numbered.map((section) => (
                <tbody key={section.key}>
                  <tr className={SECTION_H}>
                    <td aria-hidden className={`${GUTTER_W} ${SECTION_H} ${GUTTER_CELL} z-10`}>
                      {section.secNumber}
                    </td>
                    <th
                      scope="rowgroup"
                      className={`planilla-name-col group ${NAME_W} ${SECTION_H} sticky ${NAME_LEFT} z-10 border-b border-r border-ds-border-default bg-ds-surface-2 px-1.5 max-md:px-1 text-left`}
                    >
                      <div className="flex w-full min-w-0 items-center gap-0.5">
                        <button
                          onClick={() => toggleSection(section.key)}
                          className="flex min-w-0 flex-1 items-center gap-1 max-md:gap-0.5 overflow-hidden whitespace-nowrap font-sans font-medium leading-none text-ds-text-2"
                        >
                          {collapsed.has(section.key) ? (
                            <ChevronRight className="h-3 w-3 shrink-0 max-md:h-2.5 max-md:w-2.5" />
                          ) : (
                            <ChevronDown className="h-3 w-3 shrink-0 max-md:h-2.5 max-md:w-2.5" />
                          )}
                          <span className="truncate">{SECTION_LABELS[section.key]}</span>
                          {section.rows.length === section.total ? (
                            <span className="shrink-0 text-ds-text-4 max-md:hidden">({section.total})</span>
                          ) : (
                            <span
                              role="button"
                              tabIndex={0}
                              aria-label={`Mostrar ${section.hiddenZeroIds.length} filas en cero de ${SECTION_LABELS[section.key]}`}
                              title="Mostrar filas en cero de esta sección"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (section.hiddenZeroIds.length === 0) return;
                                setRevealedZeroRowIds((prev) => {
                                  const next = new Set(prev);
                                  for (const id of section.hiddenZeroIds) next.add(id);
                                  return next;
                                });
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  if (section.hiddenZeroIds.length === 0) return;
                                  setRevealedZeroRowIds((prev) => {
                                    const next = new Set(prev);
                                    for (const id of section.hiddenZeroIds) next.add(id);
                                    return next;
                                  });
                                }
                              }}
                              className="shrink-0 text-ds-text-4 hover:text-ds-text-2 hover:underline cursor-pointer"
                            >
                              <span className="md:hidden">{section.rows.length}/{section.total}</span>
                              <span className="max-md:hidden">({section.rows.length}/{section.total})</span>
                            </span>
                          )}
                          {section.key === "INGRESOS" && bandejaIncomeBadge && (
                            <span
                              role="button"
                              tabIndex={0}
                              onClick={(e) => {
                                e.stopPropagation();
                                openUnmatchedAssigner("INGRESOS");
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  openUnmatchedAssigner("INGRESOS");
                                }
                              }}
                              className="ml-1 inline-flex max-w-[min(280px,45vw)] shrink items-center gap-1 max-md:truncate rounded-full bg-ds-surface-2 px-1.5 py-0.5 text-[12px] font-medium text-ds-text-2 hover:bg-ds-surface-3 hover:underline"
                              title={bandejaIncomeTitle ?? bandejaIncomeBadge}
                              aria-label={
                                bandejaIncomeTitle
                                  ? `Abrir bandeja de ingresos · ${bandejaIncomeTitle}`
                                  : "Abrir bandeja de ingresos sin clasificar"
                              }
                            >
                              <Inbox className="h-3 w-3 shrink-0" aria-hidden />
                              {bandejaIncomeBadge}
                            </span>
                          )}
                          {section.key === "INGRESOS" &&
                            (data.unroutedIncome?.count ?? 0) > 0 && (
                            <span
                              role="button"
                              tabIndex={0}
                              onClick={(e) => {
                                e.stopPropagation();
                                setUnroutedOpen(true);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setUnroutedOpen(true);
                                }
                              }}
                              className="ml-1 max-w-[min(220px,40vw)] shrink truncate rounded-full bg-ds-surface-2 px-1.5 py-0.5 text-[12px] font-medium text-ds-text-2 hover:bg-ds-surface-3 hover:underline"
                              title={`Facturas sin fila · ${data.unroutedIncome!.count} · ${data.unroutedIncome!.totalClp.toLocaleString("es-CL")}`}
                            >
                              Facturas sin fila ({data.unroutedIncome!.count})
                            </span>
                          )}
                          {section.key === "GAV" && bandejaExpenseBadge && (
                            <span
                              role="button"
                              tabIndex={0}
                              onClick={(e) => {
                                e.stopPropagation();
                                openUnmatchedAssigner("GAV");
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  openUnmatchedAssigner("GAV");
                                }
                              }}
                              className="ml-1 inline-flex max-w-[min(280px,45vw)] shrink items-center gap-1 max-md:truncate rounded-full bg-ds-surface-2 px-1.5 py-0.5 text-[12px] font-medium text-ds-text-2 hover:bg-ds-surface-3 hover:underline"
                              title={bandejaExpenseTitle ?? bandejaExpenseBadge}
                              aria-label={
                                bandejaExpenseTitle
                                  ? `Abrir bandeja de egresos · ${bandejaExpenseTitle}`
                                  : "Abrir bandeja de egresos sin clasificar"
                              }
                            >
                              <Inbox className="h-3 w-3 shrink-0" aria-hidden />
                              {bandejaExpenseBadge}
                            </span>
                          )}
                        </button>
                        {canManage && onAddInSection && (
                          <button
                            type="button"
                            aria-label={`Agregar concepto en ${SECTION_LABELS[section.key]}`}
                            title={`Agregar en ${SECTION_LABELS[section.key]}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              onAddInSection(section.key);
                            }}
                            className="ml-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-ds-text-3 hover:bg-ds-surface-3 hover:text-ds-text-1 opacity-100 sm:h-7 sm:w-7 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                          >
                            <Plus className="h-4 w-4" aria-hidden />
                          </button>
                        )}
                      </div>
                    </th>
                    {data.columns.map((c, i) => {
                      const v = section.subtotals[i] ?? 0;
                      const text = fmtCell(v, numberFormat);
                      return (
                        <td
                          key={c.key}
                          title={numberFormat !== "clp" && v !== 0 ? fmtCell(v, "clp") : undefined}
                          className={`${COL_W} ${SECTION_H} border-b border-r border-ds-border-default bg-ds-surface-2 px-1.5 max-md:px-[3px] text-right font-bold tabular-nums overflow-hidden whitespace-nowrap ${numSizeClass(text)} ${
                            v < 0 ? "text-status-danger-fg" : "text-ds-text-1"
                          } ${c.isCurrent ? TODAY_COL : ""}`}
                        >
                          {text}
                        </td>
                      );
                    })}
                  </tr>
                  {section.numberedRows.map(({ row, number }) => (
                    <PlanillaRow
                      key={row.id}
                      row={row}
                      rowNumber={number}
                      currentWeek={data.currentWeek}
                      canManage={canManage}
                      granularity={data.granularity}
                      sel={kb.sel}
                      visibleRowIdx={visibleRowIdxById.get(row.id) ?? 0}
                      rangeRect={activeRect}
                      editing={kb.editing}
                      onSelect={(sel, extend, meta) => {
                        setPopover(null);
                        hoverRef.current?.forceHide();
                        if (sumMode || meta) {
                          if (!sumMode) onSumModeChange?.(true);
                          toggleDiscrete(sel);
                          kb.setSel(sel);
                          return;
                        }
                        if (extend) {
                          kb.extendTo(sel);
                          return;
                        }
                        kb.setSel(sel);
                      }}
                      onSelectRow={() => {
                        setPopover(null);
                        hoverRef.current?.forceHide();
                        kb.selectRow(row.id);
                      }}
                      onStartEdit={(sel) => {
                        setPopover(null);
                        hoverRef.current?.forceHide();
                        setSheetTarget(null);
                        kb.setSel(sel);
                        kb.startEdit(sel, getEditSeed(sel));
                      }}
                      onCommit={kb.commitEdit}
                      onCancelEdit={() => kb.setEditing(null)}
                      onOpenPopover={(sel, anchor) => { kb.setSel(sel); openPopover(sel, anchor); }}
                      isRenaming={renamingRowId === row.id}
                      onRenameCommit={(name) => { setRenamingRowId(null); void actions.renameRow(row.id, name); }}
                      onRenameCancel={() => setRenamingRowId(null)}
                      rowMenu={rowMenuFor(row)}
                      onRowContext={() => setCtxTarget({ kind: "row", rowId: row.id })}
                      onOpenRowSheet={() => setSheetTarget({ kind: "row", rowId: row.id })}
                      canEditCell={canEditCell}
                      canMoveCommitted={(colIdx) => canMoveCommitted(row.id, colIdx)}
                      enableDrag={enableDrag && !sumMode}
                      dropTarget={dropTarget}
                      onCellContext={(e, sel) => {
                        const rowIdx = visibleRowIdxById.get(sel.rowId) ?? -1;
                        const inCurrentSelection =
                          (kb.sel?.rowId === sel.rowId && kb.sel.colIdx === sel.colIdx) ||
                          (!!activeRect && rowIdx >= 0 && isInRect(rowIdx, sel.colIdx, activeRect));
                        if (shouldSelectCellOnContextMenu(inCurrentSelection)) {
                          kb.setSel(sel);
                        }
                        if (
                          shouldOpenPinnedDetailOnContextMenu(isDesktopCellDetail()) &&
                          resolveHover(sel.rowId, sel.colIdx)
                        ) {
                          e.preventDefault();
                          e.stopPropagation();
                          setCtxTarget(null);
                          openPinnedCellDetail(sel);
                          return;
                        }
                        hoverRef.current?.forceHide();
                        setCtxTarget({ kind: "cell", sel });
                      }}
                      onOpenCellSheet={(sel) => setSheetTarget({ kind: "cell", sel })}
                      sumMode={sumMode}
                      discreteKeys={discreteKeys}
                      onCellDragStart={onCellDragStart}
                      onCellDragOver={onCellDragOver}
                      onCellDrop={onCellDrop}
                      onCellDragEnd={onCellDragEnd}
                      showChips={showChips}
                      numberFormat={numberFormat}
                      getCellStyle={getCellStyle}
                      driftAlertThresholdClp={
                        driftAlertThresholdClp ?? data.driftAlertThresholdClp ?? 100_000
                      }
                      rowSelected={
                        !!activeRect &&
                        (visibleRowIdxById.get(row.id) ?? -1) >= activeRect.r0 &&
                        (visibleRowIdxById.get(row.id) ?? -1) <= activeRect.r1
                      }
                      crossHighlightColIdx={crossHighlight?.colIdx ?? null}
                      crossHighlightRow={crossHighlight?.rowId === row.id}
                      searchQuery={searchQuery}
                      ufCaption={row.ufCaption}
                      hoverCards
                      onOpenNote={openNoteEditor}
                      onOpenCaretMenu={openCaretMenu}
                      onSendCobranza={
                        canManage
                          ? (args) => setCobranzaTarget(args)
                          : undefined
                      }
                    />
                  ))}
                </tbody>
              ))}
              <BalanceRow
                columns={data.columns}
                flows={data.flows}
                balances={data.balances}
                balanceBreaks={data.balanceBreaks}
                warnThreshold={data.warnThreshold}
                startNumber={footerStart}
                numberFormat={numberFormat}
                selectedColIdx={kb.sel?.colIdx ?? null}
                selectedColIndices={selectedColIndices}
                closedWeeks={data.closedWeeks}
                balanceAnchors={data.balanceAnchors}
                openingBalance={data.openingBalance}
                rows={data.rows}
                canManage={canManage && data.granularity === "week"}
                onBalanceAnchor={
                  canManage && data.granularity === "week"
                    ? async (weekStart, balanceClp) => {
                        try {
                          await matrix.patchBalanceAnchor(weekStart, balanceClp);
                        } catch (err) {
                          toast.error(
                            err instanceof Error
                              ? err.message
                              : "No se pudo guardar el saldo acumulado",
                          );
                          throw err;
                        }
                      }
                    : undefined
                }
              />
            </table>
          </div>
        </ContextMenuTrigger>
        {ctxItems && ctxItems.length > 0 && (
          <ContextMenuContent
            collisionPadding={12}
            className="max-h-[min(24rem,var(--radix-context-menu-content-available-height))] overflow-y-auto"
          >
            <MenuItems items={ctxItems} variant="context" />
          </ContextMenuContent>
        )}
      </ContextMenu>

      <CellLayersPopover
        state={popover}
        onClose={() => {
          setPopover(null);
          setPopoverFocusNote(false);
        }}
        canManage={canManage}
        editable={
          popover
            ? canEditCell(
                popover.row.id,
                data.columns.findIndex((c) => c.key === popover.cell.weekStart),
              )
            : false
        }
        editReason={
          !canManage
            ? "Sin permiso de edición"
            : popover && hasInvoicedIncome(popover.row.section, popover.cell.committed)
              ? "Ingreso facturado (la factura manda)"
              : undefined
        }
        focusNote={popoverFocusNote}
        excludedForRow={
          popover
            ? (data.excludedIncome ?? []).filter((e) => e.rowId === popover.row.id)
            : []
        }
        onViewDte={onViewDte}
        onExcludeDte={async (dteId, reason) => {
          await actions.excludeDte(dteId, reason);
          setPopover(null);
        }}
        onRestoreDte={async (dteId) => {
          await actions.restoreDte(dteId);
          setPopover(null);
        }}
        onSaveNote={
          canManage
            ? async (rowId, weekStart, body, opts) =>
                matrix.patchCellNote(rowId, weekStart, body, {
                  silent: true,
                  applyToFuturePlanCells: opts?.applyToFuturePlanCells,
                })
            : undefined
        }
        onSettleClosed={
          popover
            ? () =>
                void matrix.patchSettlement(
                  popover.row.id,
                  popover.cell.weekStart,
                  "CLOSED",
                  popover.cell.execution?.projected,
                )
            : undefined
        }
        onSettleReopen={
          popover
            ? () =>
                void matrix.patchSettlement(
                  popover.row.id,
                  popover.cell.weekStart,
                  "AUTO",
                )
            : undefined
        }
        onMatchPlanToReal={
          popover?.cell.real
            ? () => {
                const realSigned = popover.cell.real!.total;
                const amount =
                  popover.row.section === "FINANCIAMIENTO"
                    ? Math.round(realSigned)
                    : Math.round(Math.abs(realSigned));
                void matrix.patchPlan(
                  popover.row.id,
                  popover.cell.weekStart,
                  amount,
                );
              }
            : undefined
        }
        onMoveResidual={
          popover?.cell.execution && popover.cell.execution.residual !== 0
            ? () => {
                const from = ymdToDate(popover.cell.weekStart);
                if (!from) return;
                const toWeek = toYmd(addWeeksUTC(from, 1));
                void matrix.moveResidual(
                  popover.row.id,
                  popover.cell.weekStart,
                  toWeek,
                  popover.cell.execution!.residual,
                  popover.row.section,
                  popover.cell.execution!.projected,
                );
              }
            : undefined
        }
        moveWeeks={
          popover
            ? data.columns.filter(
                (c) =>
                  c.key !== popover.cell.weekStart &&
                  data.granularity === "week" &&
                  !closedSet.has(c.key) &&
                  !popover.row.isArchived &&
                  !popover.row.isVirtual,
              )
            : []
        }
        onMoveDte={
          canManage
            ? (dteId, targetWeek) => {
                void actions.moveDte(dteId, targetWeek);
              }
            : undefined
        }
        onMoveScheduled={
          canManage
            ? (templateId, billingPeriod, targetWeek) => {
                void actions.moveScheduled(templateId, billingPeriod, targetWeek);
              }
            : undefined
        }
        onMoveMilestone={
          canManage
            ? (milestoneKey, billingPeriod, targetWeek) => {
                void actions.moveMilestone(milestoneKey, billingPeriod, targetWeek);
              }
            : undefined
        }
        actions={popoverActions}
      />
      <FillRightDialog
        request={fillRight}
        busy={busy}
        onClose={() => setFillRight(null)}
        onConfirm={(rowId, weeks, amount) => matrix.patchPlanBulk(rowId, weeks, amount)}
      />

      <ChangeSectionDialog
        row={rowDialog?.kind === "section" ? rowDialog.row : null}
        busy={busy}
        onClose={() => setRowDialog(null)}
        onConfirm={async (section) => {
          if (rowDialog?.kind !== "section") return;
          await actions.updateRow(rowDialog.row.id, { section });
          setRowDialog(null);
        }}
      />
      <ChangeAccountsDialog
        row={rowDialog?.kind === "accounts" ? rowDialog.row : null}
        busy={busy}
        onClose={() => setRowDialog(null)}
        onConfirm={async (accountPlanIds, defaultTargetId) => {
          if (rowDialog?.kind !== "accounts") return;
          const r = await fetch(
            `/api/finance/flow-v3/rows/${rowDialog.row.id}/accounts`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                accountPlanIds,
                defaultTargetAccountPlanId: defaultTargetId,
              }),
            },
          );
          const j = await r.json();
          if (!r.ok || !j?.success) {
            toast.error(j?.error ?? "No se pudieron guardar las cuentas");
            return;
          }
          toast.success("Cuentas actualizadas");
          setRowDialog(null);
          onRefresh?.();
        }}
      />
      <DeferTermDialog
        template={rowDialog?.kind === "defer" ? rowDialog.template : null}
        busy={busy}
        onClose={() => setRowDialog(null)}
        onConfirm={async (endDate) => {
          if (rowDialog?.kind !== "defer") return;
          await actions.setTemplateEndDate(rowDialog.template.templateId, endDate);
          setRowDialog(null);
        }}
      />
      <DiasCobroDialog
        template={rowDialog?.kind === "dias" ? rowDialog.template : null}
        busy={busy}
        onClose={() => setRowDialog(null)}
        onConfirm={async (dias) => {
          if (rowDialog?.kind !== "dias") return;
          await actions.setTemplateDiasCobro(rowDialog.template.templateId, dias);
          setRowDialog(null);
        }}
      />
      <RecurringExpenseDialog
        row={rowDialog?.kind === "recurring" ? rowDialog.row : null}
        rows={rowDialog?.kind === "recurring" ? recurringRows : undefined}
        categories={expenseCategories}
        busy={busy}
        onClose={() => setRowDialog(null)}
        onConfirm={(body) => actions.createRecurring(body)}
        onUpdate={(id, body) => actions.updateRecurring(id, body)}
        onDelete={(id) => actions.deleteRecurring(id, false)}
      />

      <ConfirmDialog
        open={rowDialog?.kind === "delete"}
        onOpenChange={(o) => !o && setRowDialog(null)}
        title={`Eliminar «${rowDialog?.kind === "delete" ? rowDialog.row.name : ""}»`}
        description="La fila se elimina definitivamente. Solo es posible si no tiene plan, comprometido ni real en ninguna semana."
        confirmLabel="Eliminar"
        loading={busy}
        onConfirm={async () => {
          if (rowDialog?.kind !== "delete") return;
          const row = rowDialog.row;
          const r = await actions.deleteRow(row.id);
          if (r.ok) setRowDialog(null);
          else setRowDialog({ kind: "deleteBlocked", row, reason: r.reason });
        }}
      />
      <ConfirmDialog
        open={rowDialog?.kind === "deleteBlocked"}
        onOpenChange={(o) => !o && setRowDialog(null)}
        variant="default"
        title="No se puede eliminar la fila"
        description={
          rowDialog?.kind === "deleteBlocked"
            ? `${rowDialog.reason}. ¿Archivarla en su lugar? (se oculta hacia adelante y conserva el histórico).`
            : ""
        }
        confirmLabel="Archivar"
        cancelLabel="Cancelar"
        loading={busy}
        onConfirm={() => {
          if (rowDialog?.kind !== "deleteBlocked") return;
          onArchive(rowDialog.row);
          setRowDialog(null);
        }}
      />

      <CellActionSheet
        open={
          sheetTarget != null &&
          (sheetItems.length > 0 ||
            !!(sheetRow && (sheetRow.isVirtual || sheetRow.name === "Otros ingresos" || sheetRow.name === "Otros clientes") && sheetCell))
        }
        onOpenChange={(o) => {
          if (!o) {
            setSheetTarget(null);
            setLinkFocusDteId(null);
          }
        }}
        row={sheetRow}
        cell={sheetCell}
        weekLabel={sheetWeekLabel}
        isPast={
          !!sheetCell &&
          data.granularity === "week" &&
          sheetCell.weekStart < data.currentWeek
        }
        items={sheetItems}
        folioGroups={sheetFolioGroups}
      >
        {sheetRow &&
          (sheetRow.isVirtual || sheetRow.name === "Otros ingresos" || sheetRow.name === "Otros clientes") &&
          sheetCell &&
          (sheetCell.effective !== 0 ||
            (sheetCell.committed?.items.some((i) => i.kind === "dte") ?? false)) && (
            <UnmatchedIncomeList
              mode="bandeja"
              weekStart={sheetCell.weekStart}
              focusDteId={linkFocusDteId}
              onViewDte={onViewDte}
              onCreated={() => {
                setSheetTarget(null);
                setLinkFocusDteId(null);
                onRefresh?.();
              }}
            />
          )}
      </CellActionSheet>

      <BandejaGroupList
        open={bandejaRutSection != null}
        onOpenChange={(o) => {
          if (!o) setBandejaRutSection(null);
        }}
        section={bandejaRutSection ?? "GAV"}
        groups={bandejaGroups}
        flowRows={bandejaFlowRows}
        onClassifyGroup={handleClassifyGroup}
        onApplySuggestions={handleApplySuggestions}
        onDismiss={async (bankTransactionIds) => {
          if (bankTransactionIds.length === 0) return;
          const results = await Promise.allSettled(
            bankTransactionIds.map((id) =>
              fetch(`/api/finance/banking/transactions/${id}/mark-internal`, {
                method: "POST",
              }).then(async (res) => {
                const j = await res.json().catch(() => ({}));
                if (!res.ok || j?.success === false) {
                  throw new Error(j?.error ?? "No se pudo descartar");
                }
              }),
            ),
          );
          const ok = results.filter((r) => r.status === "fulfilled").length;
          const fail = results.length - ok;
          if (ok > 0) {
            toast.success(
              `${ok} movimiento${ok === 1 ? "" : "s"} descartado${ok === 1 ? "" : "s"} de la bandeja`,
            );
            onRefresh?.();
          }
          if (fail > 0) {
            throw new Error(
              `${fail} no se pudieron descartar (¿tenés permiso de flujo de caja?)`,
            );
          }
        }}
        onAssignAccounts={(flowRowId) => {
          const row = rowById.get(flowRowId);
          if (!row) {
            toast.error("No se encontró el renglón destino");
            return;
          }
          setBandejaRutSection(null);
          setRowDialog({ kind: "accounts", row });
        }}
        onCreateRow={() => {
          const sec = bandejaRutSection ?? "GAV";
          setBandejaRutSection(null);
          onAddInSection?.(sec);
        }}
      />

      <CellActionSheet
        open={unroutedOpen}
        onOpenChange={setUnroutedOpen}
        row={
          data.rows.find(
            (r) =>
              isFallbackBandejaRow(r) && r.section === "INGRESOS",
          ) ?? null
        }
        cell={null}
        weekLabel="Facturas sin fila"
        isPast={false}
        items={[]}
        folioGroups={[]}
      >
        <UnmatchedIncomeList
          mode="unrouted"
          weekStart={data.currentWeek}
          onViewDte={onViewDte}
          onCreated={() => {
            setUnroutedOpen(false);
            onRefresh?.();
          }}
        />
      </CellActionSheet>

      {sumMode && (
        <SumPill
          stats={discreteSelStats}
          numberFormat={numberFormat}
          onDone={clearDiscrete}
        />
      )}

      {cobranzaTarget && (
        <CobranzaSendDialog
          open={cobranzaTarget !== null}
          onClose={() => setCobranzaTarget(null)}
          dteId={cobranzaTarget.dteId}
          crmAccountId={cobranzaTarget.crmAccountId}
          daysOverdue={cobranzaTarget.daysOverdue}
        />
      )}
    </>
  );
}
