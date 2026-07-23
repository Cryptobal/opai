"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Info, Lock, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { fmtClp, fmtShortDate } from "./format";

const ZEROS_PREF_KEY = "opai-planilla-show-zeros";

function daysSince(ymd: string | null, todayYmd: string): number | null {
  if (!ymd) return null;
  const a = Date.parse(`${ymd}T00:00:00Z`);
  const b = Date.parse(`${todayYmd}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

/**
 * Modo Planilla v3. Toolbar de una línea (saldo bancario + semana crítica en
 * texto compacto en desktop) y la hoja ocupando el resto. Reúne el estado del
 * matrix (con deshacer/rehacer) y las mutaciones de estructura, y añade el
 * cierre semanal y el desglose del saldo bancario.
 */
export function PlanillaClient({ canManage }: { canManage: boolean; flagOn?: boolean }) {
  const isMobile = useIsMobileViewport();
  const m = usePlanillaMatrix();
  const actions = usePlanillaActions(m.refetch);
  const [addOpen, setAddOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const [bankOpen, setBankOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [archiving, setArchiving] = useState<FlowMatrixRowDto | null>(null);
  const [templateWarning, setTemplateWarning] = useState<string[] | null>(null);

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

  const doArchive = async () => {
    if (!archiving) return;
    const r = await actions.archiveRow(archiving.id);
    setArchiving(null);
    if (r?.warning?.activeRecurringTemplateIds?.length) {
      setTemplateWarning(r.warning.activeRecurringTemplateIds);
    }
  };

  // Semana a cerrar por defecto: la más reciente no cerrada ≤ la actual.
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
  const navBtn = "h-10 min-w-10 px-1.5 lg:h-7 lg:min-w-0 lg:px-1.5";
  const txtBtn = "h-10 px-2.5 text-xs lg:h-7 lg:px-2";

  return (
    <div className="planilla-sheet">
      <div className="mb-1 flex h-[var(--plnx-toolbar-h)] items-center gap-1 overflow-x-auto scrollbar-none px-2 lg:px-0">
        <Button variant="outline" size="sm" className={navBtn} onClick={() => nav(-1)} aria-label="Semanas anteriores">
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <Button variant="outline" size="sm" className={txtBtn} onClick={goToday}>Hoy</Button>
        <Button variant="outline" size="sm" className={navBtn} onClick={() => nav(1)} aria-label="Semanas siguientes">
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
        <div className="ml-0.5 flex h-10 shrink-0 overflow-hidden rounded-md border border-ds-border-default lg:h-7">
          {(["week", "month"] as const).map((g) => (
            <button
              key={g}
              onClick={() => m.setGranularity(g)}
              className={`px-2 text-xs ${m.granularity === g ? "bg-primary text-primary-foreground" : "bg-ds-surface-1 text-ds-text-3 hover:bg-ds-surface-2"}`}
            >
              <span className="lg:hidden">{g === "week" ? "Sem" : "Mes"}</span>
              <span className="hidden lg:inline">{g === "week" ? "Semanas" : "Meses"}</span>
            </button>
          ))}
        </div>
        <Button
          variant={showZeros ? "default" : "outline"}
          size="sm"
          className={`${txtBtn} ml-0.5`}
          onClick={toggleZeros}
          aria-pressed={showZeros}
          title={showZeros ? "Ocultar filas en cero" : "Mostrar filas en cero"}
        >
          Ceros
        </Button>
        {canManage && (
          <Button size="sm" className={`${navBtn} ml-0.5 lg:px-2`} onClick={() => setAddOpen(true)} aria-label="Agregar concepto">
            <Plus className="h-3.5 w-3.5" />
            <span className="ml-1 hidden lg:inline">Agregar concepto</span>
          </Button>
        )}
        {canManage && (
          <Button
            variant="outline"
            size="sm"
            className={`${txtBtn} ml-0.5`}
            onClick={() => setCloseOpen(true)}
            title="Cerrar la semana contra el saldo del banco"
          >
            <Lock className="h-3.5 w-3.5 lg:mr-1" />
            <span className="hidden lg:inline">Cerrar semana</span>
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          className={navBtn}
          onClick={() => setLegendOpen(true)}
          aria-label="Qué significan los colores"
          title="Qué significan los colores"
        >
          <Info className="h-3.5 w-3.5" />
        </Button>
        {kpis && (
          <div className="ml-auto hidden items-center gap-1.5 whitespace-nowrap font-mono text-[11px] uppercase tracking-wide text-ds-text-3 lg:flex">
            <button
              onClick={() => setBankOpen(true)}
              className="rounded px-1 hover:bg-ds-surface-2"
              title="Ver desglose por cuenta"
            >
              Banco hoy{" "}
              <span className={bankStale ? "text-status-warn-fg" : "text-ds-text-1"}>
                {fmtClp(kpis.saldoHoy)}
              </span>
            </button>
            <span aria-hidden>·</span>
            <span>
              Mín <span className={minTone}>{fmtClp(kpis.minBalance)}</span>{" "}
              <span className="text-ds-text-4">({fmtShortDate(kpis.minWeek)})</span>
            </span>
          </div>
        )}
      </div>

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
          />
        </div>
      ) : (
        <div className="flex h-64 items-center justify-center rounded-lg border border-ds-border-subtle text-sm text-status-danger-fg">
          No se pudo cargar la planilla.
        </div>
      )}

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

      <LegendPopover open={legendOpen} onOpenChange={setLegendOpen} />
    </div>
  );
}
