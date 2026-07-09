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
import { BancaTabsHeader } from "@/components/finance/BancaTabsHeader";
import { cn } from "@/lib/utils";
import type {
  ProjectionMatrix,
  ProjectionAnchorInfo,
} from "@/modules/finance/cashflow/types";
import { HealthHeader } from "./HealthHeader";
import { ManualCloseStreakBanner, type CloseLite } from "./ManualCloseStreakBanner";
import { Legend } from "./Legend";
import { UndoToast } from "./UndoToast";
import { currentBucketIndex } from "./projection-helpers";
import { useGridWindow } from "./grid/useGridWindow";
import { GridHeader } from "./grid/GridHeader";
import { GridSection } from "./grid/GridSection";
import { GridBalanceRow } from "./grid/GridBalanceRow";
import { GridChip } from "./grid/GridChip";
import { itemRowsForKind } from "./grid/grid-helpers";
import { useGridMove, type GridDragData } from "./grid/useGridMove";

/** Semanas hacia atrás por defecto en la ventana inicial. Hasta que exista la
 *  preferencia por tenant (config.weeksBackDefault — migración pendiente, B6)
 *  se lee de este default en código. */
export const GRID_WEEKS_BACK_DEFAULT = 2;

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
  const { active, loading, goPrev, goNext, goToday, refresh } = useGridWindow(
    projection,
    { weeksBack },
  );
  const buckets = active.buckets;
  const currentIdx = useMemo(() => currentBucketIndex(buckets), [buckets]);
  const incomeRows = useMemo(
    () => itemRowsForKind(active.rows, "INCOME"),
    [active.rows],
  );
  const expenseRows = useMemo(
    () => itemRowsForKind(active.rows, "EXPENSE"),
    [active.rows],
  );
  const balanceByBucket = useMemo(
    () =>
      new Map(active.cumulativeBalances.map((b) => [b.bucketKey, b.balanceClp])),
    [active.cumulativeBalances],
  );

  // Refresca tanto el bloque visible (re-fetch del rango) como los props del
  // server (KPIs de HealthHeader) tras un move/cierre.
  const refreshAll = useCallback(async () => {
    await refresh();
    router.refresh();
  }, [refresh, router]);

  const { move, undoPayload, clearUndo } = useGridMove({
    buckets,
    refresh: refreshAll,
  });

  // Sensors: puntero (mouse + touch) con activación por distancia para no
  // disparar drag en taps, y teclado (dnd-kit maneja Space/flechas → mover con
  // teclado, cubriendo accesibilidad sin botones de flecha en cada celda).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );
  const [activeDrag, setActiveDrag] = useState<GridDragData | null>(null);

  function onDragStart(e: DragStartEvent) {
    const data = e.active.data.current as GridDragData | undefined;
    if (data?.kind === "grid-chip") setActiveDrag(data);
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
    void move(drag, over.bucketKey);
  }

  return (
    <div className="min-w-0 space-y-4">
      <BancaTabsHeader active="cashflow" />
      {recentCloses && <ManualCloseStreakBanner recentCloses={recentCloses} />}
      <HealthHeader projection={projection} />

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-ds-text-1">
          Planilla de flujo · 8 semanas
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
            label="8 semanas anteriores"
          />
          <NavButton
            dir="next"
            onClick={goNext}
            loading={loading}
            label="8 semanas siguientes"
          />
        </div>
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveDrag(null)}
      >
        <div className="max-h-[70vh] overflow-auto rounded-ds-lg border border-ds-border-default">
          <table className="w-full min-w-[720px] border-collapse text-[13px]">
            <GridHeader buckets={buckets} currentIdx={currentIdx} />
            <tbody>
              <GridSection
                label="Ingresos"
                tone="ok"
                rows={incomeRows}
                buckets={buckets}
                currentIdx={currentIdx}
                dndEnabled={canManage}
              />
              <GridSection
                label="Egresos"
                tone="warn"
                rows={expenseRows}
                buckets={buckets}
                currentIdx={currentIdx}
                dndEnabled={canManage}
              />
              <GridBalanceRow
                buckets={buckets}
                balanceByBucket={balanceByBucket}
                currentIdx={currentIdx}
              />
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
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      <Legend />
      <UndoToast payload={undoPayload} onDismiss={clearUndo} />
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
