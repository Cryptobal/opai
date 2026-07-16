"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { BancaTabsHeader } from "@/components/finance/BancaTabsHeader";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useIsMobileViewport } from "@/hooks/useIsMobileViewport";
import type {
  ProjectionMatrix,
  ProjectionAnchorInfo,
} from "@/modules/finance/cashflow/types";
import { HealthHeader } from "./HealthHeader";
import { ManualCloseStreakBanner, type CloseLite } from "./ManualCloseStreakBanner";
import { Legend } from "./Legend";
import { UndoToast } from "./UndoToast";
import { WeekCloseDrawer } from "../week-close/WeekCloseDrawer";
import { currentBucketIndex } from "./projection-helpers";
import { useGridWindow } from "./grid/useGridWindow";
import { useHorizon } from "./grid/useHorizon";
import { HorizonSelector } from "./grid/HorizonSelector";
import { usePrefetchWindow } from "./grid/usePrefetchWindow";
import { GridHeader } from "./grid/GridHeader";
import { GridSection } from "./grid/GridSection";
import { GridBalanceRow } from "./grid/GridBalanceRow";
import { GridDriftRow } from "./grid/GridDriftRow";
import { GridChip } from "./grid/GridChip";
import { buildBucketMeta, cellChip, itemRowsForKind } from "./grid/grid-helpers";
import { expenseRows } from "./grid/expense-grouping";
import { useGridMove, type GridDragData } from "./grid/useGridMove";
import { useCashflowMutations } from "./grid/useCashflowMutations";
import { deriveCumulative } from "./grid/derive-balance";
import { moveViaApi } from "./grid/cashflow-move";
import { QuotaMoveSelector } from "./grid/QuotaMoveSelector";
import { CashflowFolioSearch } from "./grid/CashflowFolioSearch";
import {
  movableOccurrencesInCell,
  occurrenceVariant,
  ymd,
} from "./grid/cell-occurrences";
import type { VirtualOccurrence } from "@/modules/finance/cashflow/types";

/** Semanas hacia atrás por defecto en la ventana inicial. Hasta que exista la
 *  preferencia por tenant (config.weeksBackDefault — migración pendiente, B6)
 *  se lee de este default en código. */
export const GRID_WEEKS_BACK_DEFAULT = 2;

/** En móvil la grilla muestra 3 columnas anchas (anterior · actual · siguiente)
 *  en vez de las 8 comprimidas, y las flechas navegan de a 1 semana. */
const MOBILE_WINDOW_WEEKS = 3;
const MOBILE_WEEKS_BACK = 1;

export interface CashflowGridProps {
  /** Proyección semanal (8 semanas) ya construida en el server y serializada a
   *  JSON: las fechas viajan como ISO string (se consumen con toDate()). */
  projection: ProjectionMatrix;
  canManage: boolean;
  anchor: ProjectionAnchorInfo | null;
  recentCloses?: CloseLite[];
  /** Semanas hacia atrás de la ventana (1 o 2). Default 2 mientras la
   *  preferencia por tenant no exista (ver B6). */
  weeksBack?: number;
}

/**
 * Flujo de Caja — grilla densa tipo planilla: contratos/clientes en filas,
 * semanas en columnas. Ventana de 8 semanas con navegación por bloques
 * (carga bajo demanda), chips de cuota arrastrables entre semanas, bandas de
 * mes en el header, fila FC de saldo acumulado y cierre semanal integrado.
 *
 * Reemplaza a `CashflowV2Shell` como vista por defecto (ver B7). El backend
 * (buildProjection, endpoints de move, weekly-close) se reutiliza tal cual.
 */
export function CashflowGrid({
  projection,
  canManage,
  anchor,
  recentCloses,
  weeksBack = GRID_WEEKS_BACK_DEFAULT,
}: CashflowGridProps) {
  const router = useRouter();
  // Móvil: 3 columnas, step 1. Desktop: horizonte configurable, step 1 (F3).
  const isMobile = useIsMobileViewport(768);
  const { horizon, setHorizon } = useHorizon();
  const windowWeeks = isMobile ? MOBILE_WINDOW_WEEKS : horizon;
  const {
    active,
    loading,
    pendingKeys,
    goPrev,
    goNext,
    goToday,
    goToWeek,
    refreshAt,
    refresh,
    refreshWeeks,
    ensureRange,
    anchorDate,
    windowWeeks: activeWindowWeeks,
  } = useGridWindow(projection, {
    weeksBack: isMobile ? MOBILE_WEEKS_BACK : weeksBack,
    windowWeeks,
    step: 1,
  });

  // Prefetch ventanas adyacentes solo en desktop (ahorro de datos en móvil).
  usePrefetchWindow({
    enabled: !isMobile,
    anchorDate,
    windowWeeks: activeWindowWeeks,
    loading,
    ensureRange,
  });
  const buckets = active.buckets;
  // El hook ya entrega EXACTAMENTE `windowWeeks` buckets (3 en móvil, 8 en
  // desktop) desde el ancla de navegación. El doble recorte móvil anterior
  // re-centraba en "hoy" con `windowSlice`, y al navegar lejos de hoy
  // `currentBucketIndex` devolvía -1 → caía a un centro arbitrario y la ventana
  // "saltaba" (2ª causa del "se queda pegado" en móvil). Ya no aplica.
  const visibleBuckets = buckets;
  const currentIdx = useMemo(
    () => currentBucketIndex(visibleBuckets),
    [visibleBuckets],
  );

  const {
    displayRowsOf,
    beginMove,
    clearPending,
    handleAmountSaved,
    handleCreated,
    handleHiddenFromFlow,
    undoPayload,
    clearUndo,
    pushUndo,
  } = useCashflowMutations({ refreshWeeks });

  const displayRows = useMemo(
    () => displayRowsOf(active.rows),
    [displayRowsOf, active.rows],
  );
  const incomeRows = useMemo(
    () => itemRowsForKind(displayRows, "INCOME"),
    [displayRows],
  );
  // Egresos agrupados: una línea por tipo de gasto (sueldos/previred/turnos
  // suman todas las instalaciones); el resto queda como filas individuales.
  const expenseGridRows = useMemo(
    () => expenseRows(displayRows),
    [displayRows],
  );
  // Saldo FC derivado una sola vez: alimenta la fila de grilla y los KPIs
  // de cierre/quiebre del HealthHeader (reacciona al optimista).
  const derivedCumulative = useMemo(
    () =>
      deriveCumulative(
        buckets,
        displayRows,
        active.openingBalanceClp,
        active.anchor,
      ),
    [buckets, displayRows, active.openingBalanceClp, active.anchor],
  );
  const balanceByBucket = useMemo(
    () => new Map(derivedCumulative.map((b) => [b.bucketKey, b.balanceClp])),
    [derivedCumulative],
  );
  // Estado de sellado por bucket (cierre / ancla) desde el anchor activo de la
  // proyección del bloque visible.
  const bucketMeta = useMemo(
    () => buildBucketMeta(buckets, active.anchor),
    [buckets, active.anchor],
  );
  // Drift acumulado por bucket (banco real − proyectado) — solo se pinta en
  // modo avanzado (hoy apagado). Depende de conciliaciones bancarias: NO es
  // derivable client-side desde displayRows; sigue leyendo cumulativePoints
  // del server/caché.
  const driftByBucket = useMemo(
    () =>
      new Map(
        active.cumulativePoints.map((p) => [
          p.bucketKey,
          p.cumulativeBankVarianceClp,
        ]),
      ),
    [active.cumulativePoints],
  );
  // Semana en proceso de cierre (Opción A): abre el WeekCloseDrawer existente.
  const [closeWeekEndIso, setCloseWeekEndIso] = useState<string | null>(null);
  // Se incrementa tras cierre/reapertura para refrescar candados de columnas.
  // Un move/edit/hide NO cambia candados → no tocar este key en ese camino.
  const [panelReloadKey, setPanelReloadKey] = useState(0);
  // La grilla se muestra siempre en vista simple (Ingresos · Egresos · Saldo),
  // sin fila de desviación (Drift) ni badges de IPC/headcount. El antiguo toggle
  // "Avanzado" que revelaba esa información contable fue retirado.
  const effectiveAdvanced = false;

  // Cierre/reapertura: ancla + candados globales cambian → refresh full +
  // props del server + re-fetch de weekly-close/status.
  const refreshAfterClose = useCallback(async () => {
    await refresh();
    router.refresh();
    setPanelReloadKey((k) => k + 1);
  }, [refresh, router]);

  // Buscador de folios: corre una factura a la semana elegida (override de
  // fecha vía dtes/[id]/move), navega la ventana hasta ahí y refresca.
  const runFolioTo = useCallback(
    async (dteId: string, date: Date) => {
      const newDate = date.toISOString().slice(0, 10);
      const r = await moveViaApi({
        occurrenceId: null,
        itemId: null,
        dteId,
        originalDate: newDate,
        newDate,
      });
      if (!r.ok) {
        toast.error(r.error ?? "No se pudo correr la factura");
        return { ok: false, error: r.error };
      }
      toast.success("Factura movida");
      // Mover-y-mostrar atómico: re-trae FRESCA la ventana de la semana destino
      // y ancla ahí. KPIs salen del caché (HealthHeader) — sin router.refresh.
      await refreshAt(date);
      return { ok: true };
    },
    [refreshAt],
  );

  // Semanas con cierre real (registro en DB), para pintar un candado accionable
  // en CADA columna cerrada de la grilla. La grilla solo conoce el ancla activo,
  // así que la lista precisa de cierres viene del endpoint de estado. Se refresca
  // tras cerrar / reabrir.
  const [closedWeeks, setClosedWeeks] = useState<
    { weekStartMs: number; weekEndIso: string; isAnchor: boolean }[]
  >([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/finance/cashflow/weekly-close/status");
        const j = await res.json();
        if (cancelled || !j.success) return;
        const cw = (
          j.data as Array<{
            weekStartDate: string;
            weekEndDate: string;
            state: string;
            isAnchor: boolean;
          }>
        )
          .filter((w) => w.state === "CLOSED")
          .map((w) => ({
            weekStartMs: Date.parse(w.weekStartDate),
            weekEndIso: w.weekEndDate,
            isAnchor: w.isAnchor,
          }));
        setClosedWeeks(cw);
      } catch {
        /* silencioso: sin datos, la grilla simplemente no muestra candados */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [panelReloadKey]);

  // Semana cuya reapertura se está confirmando (candado en la columna).
  const [reopenTarget, setReopenTarget] = useState<{
    weekEndIso: string;
    isAnchor: boolean;
    label: string;
  } | null>(null);
  const [reopening, setReopening] = useState(false);

  // Abre el diálogo de confirmación. Las columnas son angostas para confirmar
  // inline, así que la confirmación vive en un diálogo central.
  const requestReopen = useCallback(
    (weekEndIso: string, opts: { isAnchor: boolean; label: string }) => {
      setReopenTarget({ weekEndIso, ...opts });
    },
    [],
  );

  // Reabre (desbloquea) la semana confirmada: deshace el cierre en el backend y
  // refresca grilla + KPIs.
  const confirmReopen = useCallback(async () => {
    if (!reopenTarget) return;
    setReopening(true);
    try {
      const res = await fetch(
        `/api/finance/cashflow/weekly-close?weekEnd=${encodeURIComponent(reopenTarget.weekEndIso)}`,
        { method: "DELETE" },
      );
      const j = await res.json();
      if (!j.success) throw new Error(j.error);
      toast.success(
        j.data?.wasAnchor
          ? "Semana reabierta · la proyección perdió su ancla"
          : "Semana reabierta",
      );
      setReopenTarget(null);
      await refreshAfterClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al reabrir");
    } finally {
      setReopening(false);
    }
  }, [reopenTarget, refreshAfterClose]);

  const { move, moveGroup } = useGridMove({
    buckets,
    refreshWeeks,
    onOptimistic: beginMove,
    clearOptimistic: clearPending,
    pushUndo,
  });

  const handleContextMove = useCallback(
    (args: {
      itemId: string;
      itemName: string;
      fromBucketKey: string;
      toBucketKey: string;
      value:
        | import("@/modules/finance/cashflow/types").ProjectionRowItemValue
        | undefined;
      source: import("@/modules/finance/cashflow/types").FinanceCashflowItemSource;
    }) => {
      const { itemId, itemName, fromBucketKey, toBucketKey, value, source } =
        args;
      if (!value || value.amount === 0) return;
      const chip = cellChip(value, source);
      void move(
        {
          kind: "grid-chip",
          itemId,
          itemName,
          occurrenceId: value.occurrenceId,
          dteId: value.dteId ?? null,
          originalDate: value.scheduledDate,
          fromBucketKey,
          amount: value.amount,
          variant: chip.variant,
          locked: chip.locked,
        },
        toBucketKey,
      );
    },
    [move],
  );

  // Sensors: puntero (mouse + touch) con activación por long-press (delay +
  // tolerance) para NO secuestrar el scroll táctil de la grilla. Un scroll
  // rápido no alcanza el delay; si el dedo se mueve >8px antes del delay se
  // cancela (es scroll, no drag). 180ms se siente más responsivo que 200 sin
  // volver a pelear con el scroll (no bajar de ~150). Teclado para
  // accesibilidad (Space/flechas).
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { delay: 180, tolerance: 8 },
    }),
    useSensor(KeyboardSensor),
  );
  const [activeDrag, setActiveDrag] = useState<GridDragData | null>(null);
  // Selector "¿cuál cuota mover?": activo cuando se suelta una celda con más de
  // una cuota movible. Guarda el arrastre origen, las cuotas candidatas y el
  // destino; al elegir una se llama al mismo move unificado.
  const [multiMove, setMultiMove] = useState<{
    drag: GridDragData;
    toBucketKey: string;
    toLabel: string;
    occurrences: VirtualOccurrence[];
  } | null>(null);

  function onDragStart(e: DragStartEvent) {
    const data = e.active.data.current as GridDragData | undefined;
    if (data?.kind !== "grid-chip") return;
    setActiveDrag(data);
    // Tick háptico al quedar "agarrado" el chip (justo cuando se supera el
    // long-press). Guard: no todos los dispositivos soportan Vibration API.
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate?.(10);
    }
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveDrag(null);
    const drag = e.active.data.current as GridDragData | undefined;
    const over = e.over?.data.current as
      | { itemId: string; bucketKey: string }
      | undefined;
    if (!drag || drag.kind !== "grid-chip" || !over) return;
    // Solo destino válido: otra semana de la MISMA fila.
    if (over.itemId !== drag.itemId) return;
    if (over.bucketKey === drag.fromBucketKey) return;
    // Fila de egreso agrupado: se mueven TODAS las instalaciones de esa semana
    // juntas ("los sueldos se pagan todos juntos"). Las pagadas quedan fijas.
    if (drag.itemId?.startsWith("_group:")) {
      const groupRow = expenseGridRows.find(
        (r) => r.item.itemId === drag.itemId,
      );
      const ids = (
        groupRow?.group?.occurrencesByBucket.get(drag.fromBucketKey) ?? []
      ).map((o) => o.id);
      if (ids.length === 0) return;
      const source = groupRow?.group?.source;
      const fromBucket = buckets.find((b) => b.key === drag.fromBucketKey);
      const skippedPaid =
        source && fromBucket
          ? fromBucket.occurrences.filter(
              (o) =>
                o.source === source &&
                (o.status === "PAID" || o.bankTransactionId !== null),
            ).length
          : 0;
      void moveGroup({
        occurrenceIds: ids,
        label: groupRow?.item.itemName ?? "Egresos",
        fromBucketKey: drag.fromBucketKey,
        toBucketKey: over.bucketKey,
        skippedPaid,
      });
      return;
    }
    // Si la celda origen tiene más de una cuota movible, no adivinamos cuál:
    // abrimos el selector. Con 0/1 movible se mueve directo (comportamiento
    // original — la representativa es la única candidata).
    const fromBucket = buckets.find((b) => b.key === drag.fromBucketKey);
    const movable = fromBucket
      ? movableOccurrencesInCell(fromBucket, drag.itemId)
      : [];
    if (movable.length >= 2) {
      const toBucket = buckets.find((b) => b.key === over.bucketKey);
      setMultiMove({
        drag,
        toBucketKey: over.bucketKey,
        toLabel: toBucket?.label ?? "",
        occurrences: movable,
      });
      return;
    }
    void move(drag, over.bucketKey);
  }

  // Confirma el selector: arma un GridDragData con la cuota elegida (mismos
  // identificadores que espera el move unificado) y llama al move existente.
  function confirmMultiMove(o: VirtualOccurrence) {
    if (!multiMove) return;
    const chosen: GridDragData = {
      ...multiMove.drag,
      itemId: o.itemId ?? multiMove.drag.itemId,
      occurrenceId: o.id,
      dteId: o.dteId ?? null,
      originalDate: ymd(o.scheduledDate),
      amount: o.amountClp,
      variant: occurrenceVariant(o),
      locked: false,
    };
    const toBucketKey = multiMove.toBucketKey;
    setMultiMove(null);
    void move(chosen, toBucketKey);
  }

  return (
    <div className="min-w-0 space-y-4">
      <BancaTabsHeader active="cashflow" />
      {recentCloses && <ManualCloseStreakBanner recentCloses={recentCloses} />}
      <HealthHeader projection={active} derivedPoints={derivedCumulative} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-ds-text-1">
          Planilla de flujo · {isMobile ? "3" : horizon} semanas
        </h2>
        {!isMobile && (
          <CashflowFolioSearch
            buckets={buckets}
            canManage={canManage}
            onRun={runFolioTo}
            onLocate={goToWeek}
          />
        )}
        <div className="flex items-center gap-1">
          {!isMobile && (
            <HorizonSelector value={horizon} onChange={setHorizon} />
          )}
          <button
            type="button"
            onClick={goToday}
            aria-label="Volver a hoy"
            title="Volver a la semana actual"
            className="mr-1 inline-flex h-9 items-center gap-1.5 rounded-ds-md border border-ds-border-default px-2.5 text-[12px] text-ds-text-2 transition-colors hover:bg-ds-surface-2 hover:text-ds-text-1"
          >
            <CalendarDays className="h-3.5 w-3.5" /> Hoy
          </button>
          <NavButton
            dir="prev"
            onClick={goPrev}
            loading={loading}
            label="Semana anterior"
          />
          <NavButton
            dir="next"
            onClick={goNext}
            loading={loading}
            label="Semana siguiente"
          />
        </div>
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveDrag(null)}
      >
        {/* Scroll interno con inercia nativa (momentum) y `overscroll-contain`
            para que no arrastre la página al llegar al borde. En móvil (max-md,
            768px) las 3 columnas caben en 375px, así que se elimina el scroll
            horizontal (solo vertical) y desaparece la pelea de capas sticky.

            Altura: desktop 70vh. En móvil se descuenta la topbar fija (3rem +
            safe-area-top) y el bottom nav fijo (`--bottom-nav-height`, que ya
            incluye su safe-area-inset-bottom) usando `100dvh` (no 100vh, para no
            contar el alto de las barras del navegador móvil). Así el borde
            inferior del scroll queda por encima del bottom bar y la fila FC ·
            saldo (sticky-bottom) siempre es visible sin quedar tapada. */}
        <div className="max-h-[70vh] max-md:max-h-[calc(100dvh-3rem-env(safe-area-inset-top,0px)-var(--bottom-nav-height,4.5rem)-1rem)] overflow-auto overscroll-contain [-webkit-overflow-scrolling:touch] max-md:overflow-x-hidden rounded-ds-lg border border-ds-border-default">
          <table className="w-full min-w-[720px] max-md:min-w-0 border-collapse text-[13px]">
            <GridHeader
              buckets={visibleBuckets}
              currentIdx={currentIdx}
              bucketMeta={bucketMeta}
              canManage={canManage}
              onCloseWeek={setCloseWeekEndIso}
              onReopenWeek={requestReopen}
              closedWeeks={closedWeeks}
              pendingKeys={pendingKeys}
            />
            <tbody>
              <GridSection
                label="Ingresos"
                tone="ok"
                rows={incomeRows}
                buckets={visibleBuckets}
                currentIdx={currentIdx}
                dndEnabled={canManage}
                bucketMeta={bucketMeta}
                advanced={effectiveAdvanced}
                onAmountSaved={handleAmountSaved}
                onCreated={handleCreated}
                onHiddenFromFlow={handleHiddenFromFlow}
                onContextMove={handleContextMove}
                isMobile={isMobile}
                editableAmounts={canManage}
                pendingKeys={pendingKeys}
              />
              <GridSection
                label="Egresos"
                tone="warn"
                rows={expenseGridRows}
                buckets={visibleBuckets}
                currentIdx={currentIdx}
                dndEnabled={canManage}
                bucketMeta={bucketMeta}
                advanced={effectiveAdvanced}
                onAmountSaved={handleAmountSaved}
                onCreated={handleCreated}
                onHiddenFromFlow={handleHiddenFromFlow}
                onContextMove={handleContextMove}
                isMobile={isMobile}
                editableAmounts={canManage}
                pendingKeys={pendingKeys}
              />
              <GridBalanceRow
                buckets={visibleBuckets}
                balanceByBucket={balanceByBucket}
                currentIdx={currentIdx}
                bucketMeta={bucketMeta}
                pendingKeys={pendingKeys}
              />
              {effectiveAdvanced && (
                <GridDriftRow
                  buckets={visibleBuckets}
                  driftByBucket={driftByBucket}
                  currentIdx={currentIdx}
                  bucketMeta={bucketMeta}
                  pendingKeys={pendingKeys}
                />
              )}
            </tbody>
          </table>
        </div>
        <DragOverlay dropAnimation={null}>
          {activeDrag ? (
            <GridChip
              amount={activeDrag.amount}
              variant={activeDrag.variant}
              locked={activeDrag.locked}
              draggable
              elevated
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      <Legend />
      <UndoToast payload={undoPayload} onDismiss={clearUndo} />

      {multiMove && (
        <QuotaMoveSelector
          open={multiMove.occurrences.length >= 2}
          toLabel={multiMove.toLabel}
          occurrences={multiMove.occurrences}
          onSelect={confirmMultiMove}
          onCancel={() => setMultiMove(null)}
        />
      )}

      <WeekCloseDrawer
        open={closeWeekEndIso != null}
        weekEndIso={closeWeekEndIso ?? ""}
        onClose={() => setCloseWeekEndIso(null)}
        onCommitted={refreshAfterClose}
      />

      <Dialog
        open={reopenTarget != null}
        onOpenChange={(o) => !o && !reopening && setReopenTarget(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reabrir semana {reopenTarget?.label}</DialogTitle>
            <DialogDescription>
              La semana volverá a estado abierto y podrás volver a editarla.
              {reopenTarget?.isAnchor &&
                " Es la semana ancla: la proyección perderá su punto base hasta que ancles otra semana."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setReopenTarget(null)}
              disabled={reopening}
            >
              Cancelar
            </Button>
            <Button onClick={confirmReopen} disabled={reopening}>
              {reopening ? "Reabriendo…" : "Reabrir semana"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NavButton({
  dir,
  onClick,
  loading,
  label,
}: {
  dir: "prev" | "next";
  onClick: () => void;
  loading: boolean;
  label: string;
}) {
  const Icon = dir === "prev" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-busy={loading || undefined}
      className="inline-flex h-10 w-10 sm:h-9 sm:w-9 items-center justify-center rounded-ds-md border border-ds-border-default text-ds-text-2 transition-colors hover:bg-ds-surface-2 hover:text-ds-text-1"
    >
      <Icon className={cn("h-4 w-4", loading && "motion-safe:animate-pulse")} />
    </button>
  );
}
