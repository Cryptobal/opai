"use client";

import { useCallback, useMemo, useState } from "react";
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
import { GridHeader } from "./grid/GridHeader";
import { GridSection } from "./grid/GridSection";
import { GridBalanceRow } from "./grid/GridBalanceRow";
import { GridDriftRow } from "./grid/GridDriftRow";
import { GridChip } from "./grid/GridChip";
import { buildBucketMeta, itemRowsForKind, windowSlice } from "./grid/grid-helpers";
import { expenseRows } from "./grid/expense-grouping";
import { useGridMove, type GridDragData } from "./grid/useGridMove";
import { QuotaMoveSelector } from "./grid/QuotaMoveSelector";
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
  // Móvil: ventana de 3 columnas (anterior/actual/siguiente), navegación de a 1
  // semana. Desktop: 8 columnas, navegación por bloque. Reutiliza el hook de
  // viewport existente (no crear uno nuevo).
  const isMobile = useIsMobileViewport(768);
  const windowWeeks = isMobile ? MOBILE_WINDOW_WEEKS : undefined; // undefined → 8
  const { active, loading, goPrev, goNext, goToday, refresh } = useGridWindow(
    projection,
    {
      weeksBack: isMobile ? MOBILE_WEEKS_BACK : weeksBack,
      windowWeeks,
      step: isMobile ? 1 : undefined,
    },
  );
  const buckets = active.buckets;
  // Columnas efectivamente pintadas: en móvil se recorta la matriz a 3 centradas
  // en la semana actual (la matriz inicial del server trae 8; tras navegar ya
  // llega con 3). Header, filas, subtotales y fila FC comparten este recorte.
  const visibleBuckets = useMemo(
    () =>
      isMobile
        ? windowSlice(buckets, MOBILE_WINDOW_WEEKS, currentBucketIndex(buckets))
        : buckets,
    [isMobile, buckets],
  );
  const currentIdx = useMemo(
    () => currentBucketIndex(visibleBuckets),
    [visibleBuckets],
  );
  const incomeRows = useMemo(
    () => itemRowsForKind(active.rows, "INCOME"),
    [active.rows],
  );
  // Egresos agrupados: una línea por tipo de gasto (sueldos/previred/turnos
  // suman todas las instalaciones); el resto queda como filas individuales.
  const expenseGridRows = useMemo(
    () => expenseRows(active.rows),
    [active.rows],
  );
  const balanceByBucket = useMemo(
    () =>
      new Map(active.cumulativeBalances.map((b) => [b.bucketKey, b.balanceClp])),
    [active.cumulativeBalances],
  );
  // Estado de sellado por bucket (cierre / ancla) desde el anchor activo de la
  // proyección del bloque visible.
  const bucketMeta = useMemo(
    () => buildBucketMeta(buckets, active.anchor),
    [buckets, active.anchor],
  );
  // Drift acumulado por bucket (banco real − proyectado) — solo se pinta en
  // modo avanzado.
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
  // La grilla se muestra siempre en vista simple (Ingresos · Egresos · Saldo),
  // sin fila de desviación (Drift) ni badges de IPC/headcount. El antiguo toggle
  // "Avanzado" que revelaba esa información contable fue retirado.
  const effectiveAdvanced = false;

  // Refresca tanto el bloque visible (re-fetch del rango) como los props del
  // server (KPIs de HealthHeader) tras un move/cierre.
  const refreshAll = useCallback(async () => {
    await refresh();
    router.refresh();
  }, [refresh, router]);

  const { move, moveGroup, undoPayload, clearUndo, pushUndo } = useGridMove({
    buckets,
    refresh: refreshAll,
  });

  async function handleHiddenFromFlow(undo: {
    label: string;
    dteId: string | null;
    occurrenceId: string | null;
  }) {
    const { restoreToFlowViaApi } = await import("./grid/cashflow-hide");
    toast.success(`«${undo.label}» ocultado del flujo`);
    await refreshAll();
    pushUndo({
      occurrenceName: undo.label,
      destLabel: "ocultado del flujo",
      undo: async () => {
        const res = await restoreToFlowViaApi({
          dteId: undo.dteId,
          occurrenceId: undo.occurrenceId,
        });
        if (!res.ok) {
          toast.error(res.error ?? "No se pudo deshacer");
          return;
        }
        toast.success("Restaurado al flujo");
        await refreshAll();
      },
    });
  }

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
      <HealthHeader projection={projection} />

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-ds-text-1">
          Planilla de flujo · {isMobile ? "3" : "8"} semanas
        </h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={goToday}
            disabled={loading}
            aria-label="Volver a hoy"
            title="Volver a la semana actual"
            className="mr-1 inline-flex h-9 items-center gap-1.5 rounded-ds-md border border-ds-border-default px-2.5 text-[12px] text-ds-text-2 transition-colors hover:bg-ds-surface-2 hover:text-ds-text-1 disabled:opacity-40"
          >
            <CalendarDays className="h-3.5 w-3.5" /> Hoy
          </button>
          <NavButton
            dir="prev"
            onClick={goPrev}
            loading={loading}
            label={isMobile ? "Semana anterior" : "8 semanas anteriores"}
          />
          <NavButton
            dir="next"
            onClick={goNext}
            loading={loading}
            label={isMobile ? "Semana siguiente" : "8 semanas siguientes"}
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
                onAmountSaved={refreshAll}
                onHiddenFromFlow={handleHiddenFromFlow}
                isMobile={isMobile}
                editableAmounts={false}
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
                onAmountSaved={refreshAll}
                onHiddenFromFlow={handleHiddenFromFlow}
                isMobile={isMobile}
                editableAmounts
              />
              <GridBalanceRow
                buckets={visibleBuckets}
                balanceByBucket={balanceByBucket}
                currentIdx={currentIdx}
                bucketMeta={bucketMeta}
              />
              {effectiveAdvanced && (
                <GridDriftRow
                  buckets={visibleBuckets}
                  driftByBucket={driftByBucket}
                  currentIdx={currentIdx}
                  bucketMeta={bucketMeta}
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
        onCommitted={refreshAll}
      />
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
      disabled={loading}
      aria-label={label}
      title={label}
      className="inline-flex h-9 w-9 items-center justify-center rounded-ds-md border border-ds-border-default text-ds-text-2 transition-colors hover:bg-ds-surface-2 hover:text-ds-text-1 disabled:opacity-40"
    >
      <Icon className={cn("h-4 w-4", loading && "animate-pulse")} />
    </button>
  );
}
