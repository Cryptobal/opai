"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { FlowMatrixRowDto } from "@/modules/finance/flow-v3/matrix-types";
import { useIsMobileViewport } from "@/hooks/useIsMobileViewport";
import { useTheme } from "@/components/opai/ThemeProvider";
import { usePlanillaMatrix } from "./usePlanillaMatrix";
import { usePlanillaActions } from "./usePlanillaActions";
import { anchorTargetWeek, PlanillaGrid, scrollToWeek } from "./PlanillaGrid";
import { AddRowDialog } from "./AddRowDialog";
import { LegendPopover } from "./LegendPopover";
import { BankBalancePopover } from "./BankBalancePopover";
import { WeeklyCloseDialog } from "./WeeklyCloseDialog";
import { usePlanillaViewPrefs, type FillColor, type TextColor } from "./usePlanillaViewPrefs";
import { PlanillaMenubar } from "./PlanillaMenubar";
import { PlanillaToolbar } from "./PlanillaToolbar";
import { PlanillaFxBar, type FxSelection } from "./PlanillaFxBar";
import { PlanillaStatusbar } from "./PlanillaStatusbar";
import { exportCsv, exportXlsx, printPlanilla } from "./planilla-export";
import { displayValue } from "./grid-classes";
import type { CellSel } from "./usePlanillaKeyboard";
import {
  cellsInRect, rangeRect, rangeToTsv, type DiscreteSelStats, type RangeSel,
} from "./range-sel";
import { fmtClp, parseSignedAmount } from "./format";
import { PanelView } from "./PanelView";
import { IssuedDteSlideOver } from "@/components/finance/dtes/IssuedDteSlideOver";
import { summarizeBandejaRow } from "@/modules/finance/flow-v3/unmatched-count";
import { countCededInMatrix, countOverdueInMatrix } from "./cell-meta";

const ZEROS_PREF_KEY = "opai-planilla-show-zeros";

function daysSince(ymd: string | null, todayYmd: string): number | null {
  if (!ymd) return null;
  const a = Date.parse(`${ymd}T00:00:00Z`);
  const b = Date.parse(`${todayYmd}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

/**
 * Modo Planilla v3 — chrome (menubar, toolbar contexto+edición, fx, statusbar)
 * + grilla. Preferencias de vista en localStorage; sin cambios de API.
 */
export function PlanillaClient({
  canManage,
  tenantId = "",
}: {
  canManage: boolean;
  tenantId?: string;
  flagOn?: boolean;
}) {
  const isMobile = useIsMobileViewport();
  const { theme: appTheme } = useTheme();
  const m = usePlanillaMatrix();
  const actions = usePlanillaActions(m.refetch);
  const view = usePlanillaViewPrefs(tenantId);

  // Hoja sigue al shell: noche → planilla dark; día → papel. Solo scoped.
  useEffect(() => {
    if (!view.hydrated) return;
    view.syncWithShellTheme(appTheme);
    // syncWithShellTheme es estable; prefs.theme no debe reentrar el efecto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appTheme, view.hydrated]);

  // Catálogo de categorías (mismo endpoint que AddRowDialog / RowDialogs).
  useEffect(() => {
    let cancelled = false;
    fetch("/api/finance/cashflow/categorias?kind=EXPENSE", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        const list = (j.data ?? []) as Array<{ id: string; code: string; name: string; kind: string }>;
        setExpenseCategories(list.filter((c) => c.kind === "EXPENSE"));
      })
      .catch(() => {
        if (!cancelled) setExpenseCategories([]);
      });
    return () => { cancelled = true; };
  }, []);

  const [addOpen, setAddOpen] = useState(false);
  /** Sección prefijada desde el "+" del encabezado (null = botón global). */
  const [addPresetSection, setAddPresetSection] = useState<string | null>(null);
  /** Encadena recurrencia tras crear fila (v5.2). */
  const [pendingRecurringRowId, setPendingRecurringRowId] = useState<string | null>(null);
  /** Catálogo EXPENSE para el diálogo de recurrencia (Nueva fila → Categoría). */
  const [expenseCategories, setExpenseCategories] = useState<
    Array<{ id: string; code: string; name: string; kind: string }>
  >([]);
  const [legendOpen, setLegendOpen] = useState(false);
  const [bankOpen, setBankOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [archiving, setArchiving] = useState<FlowMatrixRowDto | null>(null);
  const [templateWarning, setTemplateWarning] = useState<string[] | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [fxSel, setFxSel] = useState<FxSelection | null>(null);
  const [fxEditable, setFxEditable] = useState(false);
  const [fxEditReason, setFxEditReason] = useState("");
  const [cellSel, setCellSel] = useState<CellSel | null>(null);
  const [selRange, setSelRange] = useState<RangeSel | null>(null);
  const [visibleRowIds, setVisibleRowIds] = useState<string[]>([]);
  const [layersReq, setLayersReq] = useState(0);
  /** Orden por monto de sesión: desc → asc → null (A→Z). */
  const [amountSort, setAmountSort] = useState<{ weekStart: string; dir: "asc" | "desc" } | null>(null);
  const [sumMode, setSumMode] = useState(false);
  const [discreteStats, setDiscreteStats] = useState<DiscreteSelStats | null>(null);
  const [viewTab, setViewTab] = useState<"planilla" | "panel">("planilla");
  const [viewDteId, setViewDteId] = useState<string | null>(null);

  const [showZeros, setShowZeros] = useState(false);
  const [moraFilter, setMoraFilter] = useState(false);
  const [cededFilter, setCededFilter] = useState(false);
  useEffect(() => {
    try {
      setShowZeros(localStorage.getItem(ZEROS_PREF_KEY) === "true");
    } catch { /* ignore */ }
  }, []);
  const toggleZeros = () =>
    setShowZeros((v) => {
      try { localStorage.setItem(ZEROS_PREF_KEY, String(!v)); } catch { /* ignore */ }
      return !v;
    });

  const sessionRowIds = useRef<Set<string>>(new Set());
  const openAddDialog = (section?: string | null) => {
    setAddPresetSection(section ?? null);
    setAddOpen(true);
  };
  const handleCreateRow = async (body: Record<string, unknown>) => {
    const r = (await actions.createRow(body)) as { id?: string; section?: string; name?: string } | null;
    if (r?.id) sessionRowIds.current.add(r.id);
    return r;
  };
  const handleRowCreated = (
    row: { id: string; section: string; name: string },
    opts: { configureRecurrence: boolean },
  ) => {
    if (opts.configureRecurrence) setPendingRecurringRowId(row.id);
  };

  const gridScrollRef = useRef<HTMLDivElement | null>(null);
  const collapseApiRef = useRef<{ expandAll: () => void; collapseAll: () => void } | null>(null);
  const bandejaApiRef = useRef<{
    openUnmatchedAssigner: (section: string) => void;
  } | null>(null);
  const [bandejaOpenReq, setBandejaOpenReq] = useState(0);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const pendingScrollToCurrent = useRef(false);

  const egresosPendientesCount = useMemo(
    () => (m.data ? summarizeBandejaRow(m.data.rows, "GAV").itemCount : 0),
    [m.data],
  );
  const moraCount = useMemo(
    () => (m.data ? countOverdueInMatrix(m.data.rows) : 0),
    [m.data],
  );
  const cededCount = useMemo(
    () => (m.data ? countCededInMatrix(m.data.rows) : 0),
    [m.data],
  );
  const toggleMoraFilter = useCallback(() => setMoraFilter((v) => !v), []);
  const toggleCededFilter = useCallback(() => setCededFilter((v) => !v), []);
  const openClassifyEgresos = useCallback(() => {
    setViewTab("planilla");
    if (bandejaApiRef.current) {
      bandejaApiRef.current.openUnmatchedAssigner("GAV");
      return;
    }
    setBandejaOpenReq((n) => n + 1);
  }, []);

  const nav = (dir: -1 | 1) => {
    const el = gridScrollRef.current;
    if (!el) return;
    const weekW = el.querySelector<HTMLElement>("[data-week]")?.offsetWidth ?? 86;
    const atLeft = el.scrollLeft <= 2;
    const atRight = el.scrollLeft >= el.scrollWidth - el.clientWidth - 2;
    if (dir === -1 && atLeft) { m.extendPast(); return; }
    if (dir === 1 && atRight) { m.extendFuture(); return; }
    el.scrollBy({ left: dir * (isMobile ? 4 : 8) * weekW, behavior: "smooth" });
  };
  const goToday = () => {
    const changed = m.resetWindow();
    if (changed) {
      pendingScrollToCurrent.current = true;
    } else if (gridScrollRef.current && m.data) {
      scrollToWeek(gridScrollRef.current, anchorTargetWeek(m.data));
    }
  };
  useEffect(() => {
    if (!pendingScrollToCurrent.current || !m.data || !gridScrollRef.current) return;
    pendingScrollToCurrent.current = false;
    scrollToWeek(gridScrollRef.current, anchorTargetWeek(m.data), false);
  }, [m.data]);

  useEffect(() => {
    document.documentElement.classList.add("sheet-focus-lock");
    return () => document.documentElement.classList.remove("sheet-focus-lock");
  }, []);

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  const toggleSearch = useCallback(() => {
    setSearchOpen((o) => {
      if (o) setSearchQuery("");
      return !o;
    });
  }, []);

  // Esc global: cierra búsqueda si está abierta (edición/popover tienen prioridad
  // vía stopPropagation en sus propios handlers).
  useEffect(() => {
    if (!searchOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) {
        // El input de búsqueda maneja Esc en su onKeyDown; otros inputs (edición) también.
        return;
      }
      e.preventDefault();
      setSearchQuery("");
      setSearchOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searchOpen]);

  const doArchive = async () => {
    if (!archiving) return;
    const r = await actions.archiveRow(archiving.id);
    setArchiving(null);
    if (r?.warning?.activeRecurringTemplateIds?.length) {
      setTemplateWarning(r.warning.activeRecurringTemplateIds);
    }
  };

  const closedSet = useMemo(() => new Set(m.data?.closedWeeks ?? []), [m.data?.closedWeeks]);
  const defaultCloseWeekEnd = useMemo(() => {
    const d = m.data;
    if (!d) return "";
    const mondays = d.columns
      .filter((c) => c.weekStart <= d.currentWeek)
      .map((c) => c.weekStart)
      .reverse();
    const monday = mondays.find((w) => !closedSet.has(w)) ?? d.currentWeek;
    const base = Date.parse(`${monday}T00:00:00Z`);
    return Number.isNaN(base) ? monday : new Date(base + 6 * 86_400_000).toISOString().slice(0, 10);
  }, [m.data, closedSet]);

  const getProjected = (mondayYmd: string): number | null => {
    const d = m.data;
    if (!d) return null;
    const idx = d.columns.findIndex((c) => c.weekStart === mondayYmd);
    return idx >= 0 ? d.balances[idx] ?? null : null;
  };

  const kpis = m.data?.kpis;
  const detail = m.data?.openingBalanceDetail;
  const bankStale =
    m.data && detail ? (daysSince(detail.lastSnapshotYmd, m.data.todayYmd) ?? 0) > 7 : false;
  const minTone = kpis
    ? kpis.minBalance < 0
      ? "text-status-danger-fg"
      : kpis.minBalance < (m.data?.warnThreshold ?? 0)
        ? "text-status-warn-fg"
        : "text-status-ok-fg"
    : "";

  const handleUndo = useCallback(async () => {
    const entry = await m.undo();
    if (!entry) toast.message("Nada que deshacer");
    else toast.message(`Deshecho: ${entry.label}`);
  }, [m]);
  const handleRedo = useCallback(async () => {
    const entry = await m.redo();
    if (!entry) toast.message("Nada que rehacer");
    else toast.message(`Rehecho: ${entry.label}`);
  }, [m]);

  const onSelectionChange = useCallback(
    (
      sel: CellSel | null,
      meta: {
        rowNumber: number;
        rowName: string;
        colIdx: number;
        weekStart: string;
        range?: RangeSel | null;
        visibleRowIds?: string[];
        canEditPlan?: boolean;
        editReason?: string;
      } | null,
    ) => {
      setCellSel(sel);
      setSelRange(meta?.range ?? (sel ? { anchor: sel, head: sel } : null));
      setVisibleRowIds(meta?.visibleRowIds ?? []);
      if (!sel || !meta || !m.data) {
        setFxSel(null);
        setFxEditable(false);
        setFxEditReason("");
        return;
      }
      const row = m.data.rows.find((r) => r.id === sel.rowId);
      const cell = row?.cells[sel.colIdx];
      setFxSel({
        rowNumber: meta.rowNumber,
        rowName: meta.rowName,
        colIdx: meta.colIdx,
        weekStart: meta.weekStart,
        row,
        cell,
      });
      setFxEditable(!!meta.canEditPlan);
      setFxEditReason(meta.editReason ?? "");
    },
    [m.data],
  );

  const selectedWeekStart = useMemo(() => {
    if (!cellSel || !m.data) return null;
    return m.data.columns[cellSel.colIdx]?.weekStart ?? null;
  }, [cellSel, m.data]);

  const selectedBold = !!(
    cellSel &&
    selectedWeekStart &&
    view.getCellStyle(cellSel.rowId, selectedWeekStart)?.bold
  );

  const rangeCellKeys = useMemo(() => {
    if (!selRange || !m.data || visibleRowIds.length === 0) return [] as Array<{ rowId: string; weekStart: string }>;
    const rect = rangeRect(selRange, visibleRowIds);
    if (!rect) return [];
    return cellsInRect(rect, visibleRowIds).map(({ rowId, colIdx }) => ({
      rowId,
      weekStart: m.data!.columns[colIdx]?.weekStart ?? "",
    })).filter((k) => k.weekStart);
  }, [selRange, visibleRowIds, m.data]);

  const applyStyle = useCallback(
    (partial: Parameters<typeof view.setCellStyle>[2]) => {
      if (rangeCellKeys.length === 0) return;
      view.setCellStylesBulk(rangeCellKeys, partial);
    },
    [rangeCellKeys, view],
  );

  const clearFormat = useCallback(() => {
    if (rangeCellKeys.length === 0) return;
    view.setCellStylesBulk(rangeCellKeys, null);
  }, [rangeCellKeys, view]);

  const rangeStats = useMemo(() => {
    // Modo Σ: el statusbar consume las stats del set discontinuo.
    if (sumMode && discreteStats && discreteStats.count > 0) {
      return {
        sum: discreteStats.sum,
        avg: discreteStats.avg,
        count: discreteStats.count,
        title: `Σ exacta ${fmtClp(discreteStats.sum)} · ${discreteStats.count} celdas`,
      };
    }
    if (!selRange || !m.data || visibleRowIds.length === 0) {
      return { sum: null as number | null, avg: null as number | null, count: 0, title: "" };
    }
    const rect = rangeRect(selRange, visibleRowIds);
    if (!rect) return { sum: null, avg: null, count: 0, title: "" };
    let sum = 0;
    let count = 0;
    for (const { rowId, colIdx } of cellsInRect(rect, visibleRowIds)) {
      const row = m.data.rows.find((r) => r.id === rowId);
      const cell = row?.cells[colIdx];
      if (!row || !cell || cell.layer === "empty") continue;
      sum += displayValue(row.section, cell.layer, cell.effective);
      count += 1;
    }
    const avg = count > 0 ? Math.round(sum / count) : null;
    return {
      sum: count > 0 ? sum : null,
      avg,
      count,
      title: count > 0
        ? `Suma exacta ${fmtClp(sum)} · magnitudes visibles del rango`
        : "",
    };
  }, [selRange, visibleRowIds, m.data, sumMode, discreteStats]);

  const cycleAmountSort = useCallback(() => {
    const week = selectedWeekStart ?? m.data?.currentWeek;
    if (!week) return;
    setAmountSort((cur) => {
      if (!cur || cur.weekStart !== week) return { weekStart: week, dir: "desc" };
      if (cur.dir === "desc") return { weekStart: week, dir: "asc" };
      return null;
    });
  }, [selectedWeekStart, m.data?.currentWeek]);

  const sortWeekLabel = useMemo(() => {
    const week = amountSort?.weekStart ?? selectedWeekStart ?? m.data?.currentWeek;
    if (!week || !m.data) return "semana";
    const col = m.data.columns.find((c) => c.weekStart === week);
    return col?.label ?? week;
  }, [amountSort, selectedWeekStart, m.data]);

  const doExportXlsx = async () => {
    if (!m.data) return;
    try {
      await exportXlsx(m.data);
      toast.success("Excel exportado");
    } catch {
      toast.error("No se pudo exportar Excel");
    }
  };
  const doExportCsv = () => {
    if (!m.data) return;
    exportCsv(m.data);
    toast.success("CSV exportado");
  };

  const doFullscreen = async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch {
      toast.message("Pantalla completa no disponible");
    }
  };

  const doCopyTsv = useCallback(async (tsv: string) => {
    try {
      await navigator.clipboard.writeText(tsv);
      toast.message("Copiado");
    } catch {
      toast.message("No se pudo copiar");
    }
  }, []);

  /** Fallback menú Editar → Copiar (usa rango actual vía grid onCopyRange). */
  const doCopy = async () => {
    if (!selRange || !m.data || visibleRowIds.length === 0) {
      if (!fxSel?.cell || !fxSel.row) return;
      const v = displayValue(fxSel.row.section, fxSel.cell.layer, fxSel.cell.effective);
      await doCopyTsv(String(Math.round(v)));
      return;
    }
    const rect = rangeRect(selRange, visibleRowIds);
    if (!rect) return;
    const grid: number[][] = [];
    let rowVals: number[] = [];
    let lastR = -1;
    const idx = new Map(visibleRowIds.map((id, i) => [id, i]));
    for (const { rowId, colIdx } of cellsInRect(rect, visibleRowIds)) {
      const ri = idx.get(rowId) ?? -1;
      if (lastR >= 0 && ri !== lastR) {
        grid.push(rowVals);
        rowVals = [];
      }
      lastR = ri;
      const row = m.data.rows.find((r) => r.id === rowId);
      const cell = row?.cells[colIdx];
      rowVals.push(row && cell ? displayValue(row.section, cell.layer, cell.effective) : 0);
    }
    if (rowVals.length) grid.push(rowVals);
    await doCopyTsv(rangeToTsv(grid));
  };

  // Atajos globales ⌘F / ⌘B (el grid maneja Z/D/flechas/Espacio).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        toggleSearch();
      } else if (e.key === "b" || e.key === "B") {
        if (rangeCellKeys.length === 0) return;
        e.preventDefault();
        const allBold = rangeCellKeys.every(
          (k) => view.getCellStyle(k.rowId, k.weekStart)?.bold,
        );
        view.setCellStylesBulk(rangeCellKeys, { bold: allBold ? null : true });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rangeCellKeys, view, toggleSearch]);

  return (
    <div
      className={`planilla-sheet${view.prefs.freeze ? "" : " no-freeze"}`}
      style={view.containerStyle}
    >
      <PlanillaMenubar
        theme={view.prefs.theme}
        density={view.prefs.density}
        freeze={view.prefs.freeze}
        showChips={view.prefs.showChips}
        showZeros={showZeros}
        numberFormat={view.prefs.numberFormat}
        canManage={canManage}
        hasSelection={!!cellSel}
        onExportXlsx={() => void doExportXlsx()}
        onExportCsv={doExportCsv}
        onPrint={printPlanilla}
        onUndo={() => void handleUndo()}
        onRedo={() => void handleRedo()}
        onCopy={() => void doCopy()}
        onFillRight={() => toast.message("Selecciona una celda y usa ⌘D")}
        onSearch={toggleSearch}
        onTheme={view.setTheme}
        onFreeze={view.setFreeze}
        onChips={view.setShowChips}
        onZeros={toggleZeros}
        onDensity={view.setDensity}
        onFullscreen={() => void doFullscreen()}
        onBold={() => {
          if (rangeCellKeys.length === 0) return;
          const allBold = rangeCellKeys.every(
            (k) => view.getCellStyle(k.rowId, k.weekStart)?.bold,
          );
          view.setCellStylesBulk(rangeCellKeys, { bold: allBold ? null : true });
        }}
        onAlignH={(a) => applyStyle({ align: a })}
        onAlignV={(a) => applyStyle({ valign: a })}
        onNumberFormat={view.setNumberFormat}
        onClearFormat={clearFormat}
        onCloseWeek={() => setCloseOpen(true)}
        onExpand={() => collapseApiRef.current?.expandAll()}
        onCollapse={() => collapseApiRef.current?.collapseAll()}
        onSortByAmount={cycleAmountSort}
        sortByAmountLabel={`Ordenar por montos de ${sortWeekLabel}`}
        onClassifyEgresos={openClassifyEgresos}
        egresosPendientesCount={egresosPendientesCount}
      />

      <PlanillaToolbar
        canManage={canManage}
        granularity={m.granularity}
        showZeros={showZeros}
        showChips={view.prefs.showChips}
        showToolbarLabels={view.prefs.showToolbarLabels}
        onToggleToolbarLabels={() =>
          view.setShowToolbarLabels(!view.prefs.showToolbarLabels)
        }
        theme={view.prefs.theme}
        zoom={view.prefs.zoom}
        numberFormat={view.prefs.numberFormat}
        freeze={view.prefs.freeze}
        hasSelection={!!cellSel}
        selectedBold={selectedBold}
        onUndo={() => void handleUndo()}
        onRedo={() => void handleRedo()}
        onNav={nav}
        onToday={goToday}
        onGranularity={m.setGranularity}
        onToggleZeros={toggleZeros}
        onChips={view.setShowChips}
        onToggleTheme={() => view.setTheme(view.prefs.theme === "paper" ? "dark" : "paper")}
        onZoom={view.setZoom}
        onNumberFormat={view.setNumberFormat}
        onToggleBold={() => {
          if (rangeCellKeys.length === 0) return;
          const allBold = rangeCellKeys.every(
            (k) => view.getCellStyle(k.rowId, k.weekStart)?.bold,
          );
          view.setCellStylesBulk(rangeCellKeys, { bold: allBold ? null : true });
        }}
        onAlignH={(a) => applyStyle({ align: a })}
        onAlignV={(a) => applyStyle({ valign: a })}
        onFill={(hex) => applyStyle(hex == null ? { fill: null } : { fill: hex as FillColor })}
        onColor={(hex) => applyStyle(hex == null ? { color: null } : { color: hex as TextColor })}
        onToggleFreeze={() => view.setFreeze(!view.prefs.freeze)}
        onExpandGroups={() => collapseApiRef.current?.expandAll()}
        onCollapseGroups={() => collapseApiRef.current?.collapseAll()}
        onSearch={toggleSearch}
        searchOpen={searchOpen}
        onExportXlsx={() => void doExportXlsx()}
        onExportCsv={doExportCsv}
        onPrint={printPlanilla}
        onCloseWeek={() => setCloseOpen(true)}
        onLegend={() => setLegendOpen(true)}
        egresosPendientesCount={egresosPendientesCount}
        onClassifyEgresos={openClassifyEgresos}
        saldoHoy={kpis?.saldoHoy ?? null}
        bankStale={bankStale}
        onOpenBank={() => setBankOpen(true)}
        sumMode={sumMode}
        onToggleSumMode={() => {
          setSumMode((v) => {
            if (v) setDiscreteStats(null);
            return !v;
          });
        }}
        viewTab={viewTab}
        onViewTab={setViewTab}
        moraCount={moraCount}
        moraFilter={moraFilter}
        onToggleMoraFilter={moraCount > 0 ? toggleMoraFilter : undefined}
        cededCount={cededCount}
        cededFilter={cededFilter}
        onToggleCededFilter={cededCount > 0 ? toggleCededFilter : undefined}
      />

      {searchOpen && (
        <div className="planilla-chrome-print-hide mb-1 flex items-center gap-2 rounded-md border border-ds-border-default bg-ds-surface-2 px-2 py-1">
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setSearchQuery("");
                setSearchOpen(false);
              }
            }}
            placeholder="Buscar concepto…"
            className="h-8 flex-1 bg-transparent text-[13px] text-ds-text-1 outline-none placeholder:text-ds-text-4"
            aria-label="Buscar concepto"
          />
          {searchQuery && (
            <button
              type="button"
              className="text-[12px] text-ds-text-3 hover:text-ds-text-1"
              onClick={() => setSearchQuery("")}
            >
              Limpiar
            </button>
          )}
          <button
            type="button"
            className="text-[12px] text-ds-text-3 hover:text-ds-text-1"
            onClick={() => { setSearchQuery(""); setSearchOpen(false); }}
          >
            Cerrar
          </button>
        </div>
      )}

      {/* Tema papel/dark solo en grilla + fx + status (toolbar/tabs = shell). */}
      <div className="planilla-theme-scope" data-planilla-theme={view.prefs.theme}>
        <PlanillaFxBar
          selection={fxSel}
          onOpenLayers={() => setLayersReq((n) => n + 1)}
          editable={fxEditable}
          editReason={fxEditReason}
          onCommitPlan={(raw) => {
            if (!cellSel || !m.data) return;
            const col = m.data.columns[cellSel.colIdx];
            if (!col) return;
            void m.patchPlan(cellSel.rowId, col.key, parseSignedAmount(raw || "0"));
          }}
          onFxBlurFocusGrid={() => {
            gridScrollRef.current?.focus({ preventScroll: true });
          }}
        />

        {viewTab === "panel" ? (
          <PanelView canManage={canManage} onViewDte={setViewDteId} />
        ) : m.loading && !m.data ? (
          <div className="flex h-64 items-center justify-center rounded-lg border border-ds-border-subtle text-sm text-ds-text-3">
            Cargando planilla…
          </div>
        ) : m.data ? (
          <div className={m.loading ? "pointer-events-none opacity-60 transition-opacity" : ""}>
            <PlanillaGrid
              data={m.data}
              canManage={canManage}
              matrix={{
                patchPlan: m.patchPlan,
                patchPlanBulk: m.patchPlanBulk,
                movePlan: m.movePlan,
                patchCellNote: m.patchCellNote,
                patchSettlement: m.patchSettlement,
                moveResidual: m.moveResidual,
                undo: m.undo,
                redo: m.redo,
              }}
              actions={actions}
              onArchive={setArchiving}
              enableDrag={!isMobile}
              showZeros={showZeros}
              moraFilter={moraFilter}
              cededFilter={cededFilter}
              alwaysVisibleRowIds={sessionRowIds.current}
              scrollerRef={gridScrollRef}
              showChips={view.prefs.showChips}
              numberFormat={view.prefs.numberFormat}
              getCellStyle={view.getCellStyle}
              onSelectionChange={onSelectionChange}
              searchQuery={searchQuery}
              collapseApiRef={collapseApiRef}
              bandejaApiRef={bandejaApiRef}
              openBandejaRequest={bandejaOpenReq}
              openLayersRequest={layersReq}
              onCopyRange={(tsv) => void doCopyTsv(tsv)}
              nameW={view.prefs.nameW}
              onNameWChange={view.setNameW}
              amountSort={amountSort}
              sumMode={sumMode}
              onSumModeChange={setSumMode}
              onDiscreteStats={setDiscreteStats}
              onRefresh={() => void m.refetch()}
              onViewDte={setViewDteId}
              expenseCategories={expenseCategories}
              onAddInSection={(section) => openAddDialog(section)}
              openRecurringRowId={pendingRecurringRowId}
              onRecurringOpened={() => setPendingRecurringRowId(null)}
            />
          </div>
        ) : (
          <div className="flex h-64 items-center justify-center rounded-lg border border-ds-border-subtle text-sm text-status-danger-fg">
            No se pudo cargar la planilla.
          </div>
        )}

        {viewTab === "planilla" && (
          <PlanillaStatusbar
            saldoHoy={kpis?.saldoHoy ?? null}
            minBalance={kpis?.minBalance ?? null}
            minWeek={kpis?.minWeek ?? null}
            bankStale={bankStale}
            minTone={minTone}
            onOpenBank={() => setBankOpen(true)}
            rangeSum={rangeStats.sum}
            rangeAvg={rangeStats.avg}
            rangeCount={rangeStats.count}
            numberFormat={view.prefs.numberFormat}
            rangeTitle={rangeStats.title}
          />
        )}
      </div>

      <AddRowDialog
        open={addOpen}
        onOpenChange={(o) => {
          setAddOpen(o);
          if (!o) setAddPresetSection(null);
        }}
        busy={actions.busy}
        onCreate={handleCreateRow}
        lockedSection={addPresetSection}
        onCreated={handleRowCreated}
      />

      {detail && m.data && (
        <BankBalancePopover
          open={bankOpen}
          onOpenChange={setBankOpen}
          detail={detail}
          todayYmd={m.data.todayYmd}
        />
      )}

      {m.data && (
        <WeeklyCloseDialog
          open={closeOpen}
          initialWeekEnd={defaultCloseWeekEnd}
          busy={actions.busy}
          getProjected={getProjected}
          onClose={() => setCloseOpen(false)}
          onConfirm={actions.closeWeek}
          onReopen={(weekEnd) => { void actions.reopenWeek(weekEnd); setCloseOpen(false); }}
        />
      )}

      <ConfirmDialog
        open={archiving != null}
        onOpenChange={(o) => !o && setArchiving(null)}
        title={`Archivar "${archiving?.name ?? ""}"`}
        description="La fila desaparece hacia adelante y reaparece sola al navegar a semanas donde tuvo movimiento. El plan histórico se conserva."
        confirmLabel="Archivar"
        loading={actions.busy}
        onConfirm={doArchive}
      />

      <ConfirmDialog
        open={templateWarning != null}
        onOpenChange={(o) => !o && setTemplateWarning(null)}
        title="La cuenta tiene programación de facturación activa"
        description="¿Desactivar también la programación? (fija su término a ayer; deja de emitir borradores y de proyectarse)"
        confirmLabel="Desactivar programación"
        cancelLabel="Mantenerla activa"
        loading={actions.busy}
        onConfirm={async () => {
          for (const id of templateWarning ?? []) await actions.deactivateTemplate(id);
          setTemplateWarning(null);
        }}
      />

      <LegendPopover open={legendOpen} onOpenChange={setLegendOpen} showChips={view.prefs.showChips} />

      {viewDteId && (
        <div className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-[60] sm:bottom-6">
          <a
            href={`/finanzas/facturacion/dtes?dte=${viewDteId}`}
            className="inline-flex min-h-10 items-center rounded-full border border-ds-border-default bg-ds-surface-1 px-3 py-2 text-[12px] font-medium text-ds-text-1 shadow-sm hover:border-primary/40"
          >
            Abrir en Facturación ↗
          </a>
        </div>
      )}
      <IssuedDteSlideOver
        open={viewDteId !== null}
        onClose={() => setViewDteId(null)}
        dteId={viewDteId}
        canManage={canManage}
      />
    </div>
  );
}
