"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  addWeeksUTC,
  defaultHorizon,
  toYmd,
  ymdToDate,
} from "@/modules/finance/flow-v3/weeks";
import type { FlowMatrixResponse } from "@/modules/finance/flow-v3/matrix-types";
import { fmtShortDate } from "./format";
import { usePlanillaHistory, type HistoryEntry } from "./usePlanillaHistory";
import type { CellSel } from "./usePlanillaKeyboard";

const STEP_WEEKS = 8;

interface MutateOpts {
  skipHistory?: boolean;
}

function initialWindow() {
  const d = defaultHorizon(new Date());
  return { from: toYmd(d.from), to: toYmd(d.to) };
}

/**
 * Estado de la planilla. Móvil y desktop cargan el MISMO horizonte lógico
 * (hoy−4 semanas → hoy+12 meses, ~57 columnas ≤60 montadas); dentro de él se
 * navega con scroll nativo, sin refetch. La ventana solo se desplaza (bloques
 * de 8 semanas, un fetch) cuando el usuario llega al borde del horizonte.
 * Respuestas fuera de orden se descartan (generation guard + AbortController).
 * Edición optimista del plan con reconciliación read-after-write y pila de
 * deshacer/rehacer en memoria (§5A).
 */
export function usePlanillaMatrix() {
  const [window_, setWindow] = useState(initialWindow);
  const [granularity, setGranularityState] = useState<"week" | "month">("week");
  const [data, setData] = useState<FlowMatrixResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const genRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const history = usePlanillaHistory();

  // Ref siempre-fresca para leer el valor previo de una celda de forma síncrona
  // al construir las entradas de la pila de deshacer.
  const dataRef = useRef<FlowMatrixResponse | null>(null);
  dataRef.current = data;

  const fetchMatrix = useCallback(
    async (w: { from: string; to: string }, g: "week" | "month") => {
      const gen = ++genRef.current;
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setLoading(true);
      try {
        const params = new URLSearchParams({ from: w.from, to: w.to, horizon: g });
        const res = await fetch(`/api/finance/flow-v3/matrix?${params}`, {
          cache: "no-store",
          signal: ac.signal,
        });
        const json = await res.json();
        if (gen !== genRef.current) return;
        if (!json.success) throw new Error(json.error ?? "Error");
        setData(json.data as FlowMatrixResponse);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (gen === genRef.current) {
          toast.error(err instanceof Error ? err.message : "No se pudo cargar la planilla");
        }
      } finally {
        if (gen === genRef.current) setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void fetchMatrix(window_, granularity);
  }, [window_, granularity, fetchMatrix]);

  /** Desplaza el horizonte completo (solo se usa al llegar a un borde). La pila
   *  de deshacer se limpia: sus punteros apuntarían a semanas ya no cargadas. */
  const shiftWindow = useCallback(
    (weeks: number) => {
      history.clear();
      setWindow((w) => ({
        from: toYmd(addWeeksUTC(ymdToDate(w.from)!, weeks)),
        to: toYmd(addWeeksUTC(ymdToDate(w.to)!, weeks)),
      }));
    },
    [history],
  );

  const extendPast = useCallback(() => shiftWindow(-STEP_WEEKS), [shiftWindow]);
  const extendFuture = useCallback(() => shiftWindow(STEP_WEEKS), [shiftWindow]);

  const setGranularity = useCallback(
    (g: "week" | "month") => {
      history.clear();
      setGranularityState(g);
    },
    [history],
  );

  /** Vuelve al horizonte default. Devuelve true si hubo cambio (refetch). */
  const resetWindow = useCallback(() => {
    const init = initialWindow();
    let changed = false;
    setWindow((w) => {
      if (w.from === init.from && w.to === init.to) return w;
      changed = true;
      return init;
    });
    if (changed) history.clear();
    return changed;
  }, [history]);

  const refetch = useCallback(
    () => fetchMatrix(window_, granularity),
    [fetchMatrix, window_, granularity],
  );

  const readCellPlan = useCallback((rowId: string, weekStart: string): number => {
    const row = dataRef.current?.rows.find((r) => r.id === rowId);
    return row?.cells.find((c) => c.weekStart === weekStart)?.plan ?? 0;
  }, []);

  const focusOf = useCallback((rowId: string, weekStart: string): CellSel | null => {
    const d = dataRef.current;
    if (!d) return null;
    const colIdx = d.columns.findIndex((c) => c.key === weekStart);
    return colIdx >= 0 ? { rowId, colIdx } : null;
  }, []);

  const rowName = useCallback((rowId: string): string => {
    return dataRef.current?.rows.find((r) => r.id === rowId)?.name ?? "concepto";
  }, []);

  /** Escribe una celda con actualización optimista + reconciliación de servidor.
   *  Lanza si el servidor rechaza (tras revertir la optimista) para que la pila
   *  de deshacer pueda avisar. */
  const applyPlanCell = useCallback(
    async (rowId: string, weekStart: string, amount: number): Promise<void> => {
      let prev: FlowMatrixResponse | null = null;
      setData((d) => {
        if (!d) return d;
        prev = d;
        const rows = d.rows.map((r) =>
          r.id !== rowId
            ? r
            : { ...r, cells: r.cells.map((c) => (c.weekStart === weekStart ? { ...c } : c)) },
        );
        const next = { ...d, rows, flows: [...d.flows], balances: [...d.balances] };
        const row = next.rows.find((r) => r.id === rowId);
        const colIdx = next.columns.findIndex((c) => c.key === weekStart);
        const cell = row?.cells[colIdx];
        if (!row || !cell || colIdx < 0) return next;
        const sign = row.section === "INGRESOS" || row.section === "FINANCIAMIENTO" ? 1 : -1;
        const oldEffective = cell.effective;
        cell.plan = amount;
        if (cell.layer === "plan" || cell.layer === "empty") {
          cell.effective = sign * amount;
          cell.layer = amount === 0 ? "empty" : "plan";
          const delta = cell.effective - oldEffective;
          next.flows[colIdx] += delta;
          for (let i = colIdx; i < next.balances.length; i++) {
            if (!next.columns[i].isPast) next.balances[i] += delta;
          }
        }
        return next;
      });
      try {
        const res = await fetch("/api/finance/flow-v3/plan", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rowId, weekStart, amount }),
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error ?? "Error al guardar");
        const saved = json.data as { amount: number };
        if (saved.amount !== amount) void refetch();
      } catch (err) {
        if (prev) setData(prev);
        throw err instanceof Error ? err : new Error("No se pudo guardar la celda");
      }
    },
    [refetch],
  );

  /** Restaura un conjunto de celdas a un valor exacto (PATCH por celda) y
   *  reconcilia con un refetch. Usado por el undo de fill-right / move. */
  const restoreCells = useCallback(
    async (rowId: string, cells: Array<{ weekStart: string; amount: number }>): Promise<void> => {
      await Promise.all(
        cells.map(async (c) => {
          const res = await fetch("/api/finance/flow-v3/plan", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rowId, weekStart: c.weekStart, amount: c.amount }),
          });
          const json = await res.json();
          if (!json.success) throw new Error(json.error ?? "No se pudo deshacer");
        }),
      );
      await refetch();
    },
    [refetch],
  );

  const applyPlanBulk = useCallback(
    async (rowId: string, weekStarts: string[], amount: number): Promise<void> => {
      const res = await fetch("/api/finance/flow-v3/plan/bulk-fill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rowId, weekStarts, amount }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "No se pudo rellenar");
      await refetch();
    },
    [refetch],
  );

  const applyMove = useCallback(
    async (rowId: string, fromWeek: string, toWeek: string): Promise<void> => {
      const res = await fetch("/api/finance/flow-v3/plan/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rowId, fromWeek, toWeek }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "No se pudo mover");
      await refetch();
    },
    [refetch],
  );

  /** PATCH de una celda plan + entrada en la pila de deshacer. */
  const patchPlan = useCallback(
    async (rowId: string, weekStart: string, amount: number, opts?: MutateOpts): Promise<void> => {
      const prevAmount = readCellPlan(rowId, weekStart);
      if (prevAmount === amount) return;
      const focus = focusOf(rowId, weekStart);
      const name = rowName(rowId);
      try {
        await applyPlanCell(rowId, weekStart, amount);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo guardar la celda");
        return;
      }
      if (!opts?.skipHistory) {
        history.push({
          label: `${amount === 0 ? "Borrar" : "Editar"} ${name} · ${fmtShortDate(weekStart)}`,
          focus,
          undo: () => applyPlanCell(rowId, weekStart, prevAmount),
          redo: () => applyPlanCell(rowId, weekStart, amount),
        });
      }
    },
    [applyPlanCell, focusOf, history, readCellPlan, rowName],
  );

  /** Fill-right: mismo monto en N semanas + una entrada de deshacer. */
  const patchPlanBulk = useCallback(
    async (rowId: string, weekStarts: string[], amount: number, opts?: MutateOpts) => {
      const prev = weekStarts.map((w) => ({ weekStart: w, amount: readCellPlan(rowId, w) }));
      const focus = focusOf(rowId, weekStarts[0]);
      const name = rowName(rowId);
      try {
        await applyPlanBulk(rowId, weekStarts, amount);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo rellenar");
        return null;
      }
      if (!opts?.skipHistory) {
        history.push({
          label: `Rellenar ${name} · ${weekStarts.length} semana${weekStarts.length === 1 ? "" : "s"}`,
          focus,
          undo: () => restoreCells(rowId, prev),
          redo: () => applyPlanBulk(rowId, weekStarts, amount),
        });
      }
      toast.success(
        `${weekStarts.length} semana${weekStarts.length === 1 ? "" : "s"} rellenada${weekStarts.length === 1 ? "" : "s"}`,
      );
      return { ok: true as const };
    },
    [applyPlanBulk, focusOf, history, readCellPlan, restoreCells, rowName],
  );

  /** Mueve el plan de una semana a otra (misma fila) + entrada de deshacer. */
  const movePlan = useCallback(
    async (rowId: string, fromWeek: string, toWeek: string, opts?: MutateOpts) => {
      if (fromWeek === toWeek) return null;
      const prevFrom = readCellPlan(rowId, fromWeek);
      if (prevFrom === 0) return null; // nada que mover
      const prevTo = readCellPlan(rowId, toWeek);
      const focus = focusOf(rowId, toWeek);
      const name = rowName(rowId);
      try {
        await applyMove(rowId, fromWeek, toWeek);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo mover el plan");
        return null;
      }
      if (!opts?.skipHistory) {
        history.push({
          label: `Mover ${name} → ${fmtShortDate(toWeek)}`,
          focus,
          undo: () =>
            restoreCells(rowId, [
              { weekStart: fromWeek, amount: prevFrom },
              { weekStart: toWeek, amount: prevTo },
            ]),
          redo: () => applyMove(rowId, fromWeek, toWeek),
        });
      }
      toast.success(prevTo !== 0 ? "Plan movido y sumado en la semana destino" : "Plan movido");
      return { ok: true as const, summed: prevTo !== 0 };
    },
    [applyMove, focusOf, history, readCellPlan, restoreCells, rowName],
  );

  const undo = useCallback(async (): Promise<HistoryEntry | null> => {
    try {
      return await history.undo();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo deshacer");
      await refetch();
      return null;
    }
  }, [history, refetch]);

  const redo = useCallback(async (): Promise<HistoryEntry | null> => {
    try {
      return await history.redo();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo rehacer");
      await refetch();
      return null;
    }
  }, [history, refetch]);

  return {
    data, loading, granularity, setGranularity,
    extendPast, extendFuture, resetWindow, refetch,
    patchPlan, patchPlanBulk, movePlan, undo, redo,
  };
}
