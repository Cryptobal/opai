"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { FlowMatrixRowDto } from "@/modules/finance/flow-v3/matrix-types";
import { useIsMobileViewport } from "@/hooks/useIsMobileViewport";
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

const ZEROS_PREF_KEY = "opai-planilla-show-zeros";

function daysSince(ymd: string | null, todayYmd: string): number | null {
  if (!ymd) return null;
  const a = Date.parse(`${ymd}T00:00:00Z`);
  const b = Date.parse(`${todayYmd}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

/**
 * Modo Planilla v3 — chrome estilo Google Sheets (menubar, toolbar, fx, statusbar)
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
  const m = usePlanillaMatrix();
  const actions = usePlanillaActions(m.refetch);
  const view = usePlanillaViewPrefs(tenantId);

  const [addOpen, setAddOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const [bankOpen, setBankOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [archiving, setArchiving] = useState<FlowMatrixRowDto | null>(null);
  const [templateWarning, setTemplateWarning] = useState<string[] | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [fxSel, setFxSel] = useState<FxSelection | null>(null);
  const [cellSel, setCellSel] = useState<CellSel | null>(null);
  const [layersReq, setLayersReq] = useState(0);

  const [showZeros, setShowZeros] = useState(false);
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
  const handleCreateRow = async (body: Record<string, unknown>) => {
    const r = (await actions.createRow(body)) as { id?: string } | null;
    if (r?.id) sessionRowIds.current.add(r.id);
    return r;
  };

  const gridScrollRef = useRef<HTMLDivElement | null>(null);
  const collapseApiRef = useRef<{ expandAll: () => void; collapseAll: () => void } | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const pendingScrollToCurrent = useRef(false);

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
      } | null,
    ) => {
      setCellSel(sel);
      if (!sel || !meta || !m.data) {
        setFxSel(null);
        return;
      }
      const row = m.data.rows.find((r) => r.id === sel.rowId);
      const cell = row?.cells[sel.colIdx];
      setFxSel({
        ...meta,
        row,
        cell,
      });
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

  const applyStyle = useCallback(
    (partial: Parameters<typeof view.setCellStyle>[2]) => {
      if (!cellSel || !selectedWeekStart) return;
      view.setCellStyle(cellSel.rowId, selectedWeekStart, partial);
    },
    [cellSel, selectedWeekStart, view],
  );

  const rowStats = useMemo(() => {
    if (!cellSel || !m.data) return { sum: null as number | null, count: 0 };
    const row = m.data.rows.find((r) => r.id === cellSel.rowId);
    if (!row) return { sum: null, count: 0 };
    let sum = 0;
    let count = 0;
    for (const cell of row.cells) {
      if (cell.layer === "empty") continue;
      sum += displayValue(row.section, cell.layer, cell.effective);
      count += 1;
    }
    return { sum, count };
  }, [cellSel, m.data]);

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

  const doCopy = async () => {
    if (!fxSel?.cell || !fxSel.row) return;
    const v = displayValue(fxSel.row.section, fxSel.cell.layer, fxSel.cell.effective);
    try {
      await navigator.clipboard.writeText(String(Math.round(v)));
      toast.message("Copiado");
    } catch {
      toast.message("No se pudo copiar");
    }
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
        setSearchOpen(true);
      } else if (e.key === "b" || e.key === "B") {
        if (!cellSel || !selectedWeekStart) return;
        e.preventDefault();
        view.toggleBold(cellSel.rowId, selectedWeekStart);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cellSel, selectedWeekStart, view]);

  return (
    <div
      className={`planilla-sheet${view.prefs.freeze ? "" : " no-freeze"}`}
      data-planilla-theme={view.prefs.theme}
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
        onSearch={() => setSearchOpen(true)}
        onTheme={view.setTheme}
        onFreeze={view.setFreeze}
        onChips={view.setShowChips}
        onZeros={toggleZeros}
        onDensity={view.setDensity}
        onFullscreen={() => void doFullscreen()}
        onBold={() => cellSel && selectedWeekStart && view.toggleBold(cellSel.rowId, selectedWeekStart)}
        onAlignH={(a) => applyStyle({ align: a })}
        onAlignV={(a) => applyStyle({ valign: a })}
        onNumberFormat={view.setNumberFormat}
        onClearFormat={() => cellSel && selectedWeekStart && view.clearCellStyle(cellSel.rowId, selectedWeekStart)}
        onAdd={() => setAddOpen(true)}
        onCloseWeek={() => setCloseOpen(true)}
        onExpand={() => collapseApiRef.current?.expandAll()}
        onCollapse={() => collapseApiRef.current?.collapseAll()}
      />

      <PlanillaToolbar
        canManage={canManage}
        granularity={m.granularity}
        showZeros={showZeros}
        showChips={view.prefs.showChips}
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
        onToggleChips={() => view.setShowChips(!view.prefs.showChips)}
        onToggleTheme={() => view.setTheme(view.prefs.theme === "paper" ? "dark" : "paper")}
        onZoom={view.setZoom}
        onNumberFormat={view.setNumberFormat}
        onToggleBold={() => cellSel && selectedWeekStart && view.toggleBold(cellSel.rowId, selectedWeekStart)}
        onAlignH={(a) => applyStyle({ align: a })}
        onAlignV={(a) => applyStyle({ valign: a })}
        onFill={(hex) => applyStyle({ fill: hex as FillColor })}
        onColor={(hex) => applyStyle({ color: hex as TextColor })}
        onToggleFreeze={() => view.setFreeze(!view.prefs.freeze)}
        onExpandGroups={() => collapseApiRef.current?.expandAll()}
        onCollapseGroups={() => collapseApiRef.current?.collapseAll()}
        onSearch={() => setSearchOpen(true)}
        onExportXlsx={() => void doExportXlsx()}
        onExportCsv={doExportCsv}
        onPrint={printPlanilla}
        onAdd={() => setAddOpen(true)}
        onCloseWeek={() => setCloseOpen(true)}
        onLegend={() => setLegendOpen(true)}
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

      <PlanillaFxBar
        selection={fxSel}
        onOpenLayers={() => setLayersReq((n) => n + 1)}
      />

      {m.loading && !m.data ? (
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
              undo: m.undo,
              redo: m.redo,
            }}
            actions={actions}
            onArchive={setArchiving}
            enableDrag={!isMobile}
            showZeros={showZeros}
            alwaysVisibleRowIds={sessionRowIds.current}
            scrollerRef={gridScrollRef}
            showChips={view.prefs.showChips}
            numberFormat={view.prefs.numberFormat}
            getCellStyle={view.getCellStyle}
            onSelectionChange={onSelectionChange}
            searchQuery={searchQuery}
            collapseApiRef={collapseApiRef}
            openLayersRequest={layersReq}
          />
        </div>
      ) : (
        <div className="flex h-64 items-center justify-center rounded-lg border border-ds-border-subtle text-sm text-status-danger-fg">
          No se pudo cargar la planilla.
        </div>
      )}

      <PlanillaStatusbar
        saldoHoy={kpis?.saldoHoy ?? null}
        minBalance={kpis?.minBalance ?? null}
        minWeek={kpis?.minWeek ?? null}
        bankStale={bankStale}
        minTone={minTone}
        onOpenBank={() => setBankOpen(true)}
        rowSum={rowStats.sum}
        rowCellCount={rowStats.count}
      />

      <AddRowDialog open={addOpen} onOpenChange={setAddOpen} busy={actions.busy} onCreate={handleCreateRow} />

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
    </div>
  );
}
