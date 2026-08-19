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
import {
  normalizeFinancingPlanAmount,
  planCashSign,
} from "@/modules/finance/flow-v3/residual";
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

  const readCellNote = useCallback((rowId: string, weekStart: string): string | null => {
    const row = dataRef.current?.rows.find((r) => r.id === rowId);
    const note = row?.cells.find((c) => c.weekStart === weekStart)?.note;
    return note?.trim() ? note.trim() : null;
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
      // Normalizar ANTES del fetch: RETIRO_SOCIO / FACTORING / DEVOL_* → −|n|.
      const rowMeta = data?.rows.find((r) => r.id === rowId);
      const normalized = rowMeta
        ? normalizeFinancingPlanAmount(rowMeta.section, amount, rowMeta.canonicalKey)
        : amount;
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
        const oldEffective = cell.effective;
        cell.plan = normalized;
        // Plan manual pisa proyecciones (committed), salvo real o ingreso facturado.
        // La reconciliación con el servidor confirma; aquí solo optimismo de UI.
        const invoiced =
          row.section === "INGRESOS" &&
          (cell.committed?.items.some((i) => i.kind === "dte") ?? false);
        if (cell.layer !== "real" && !invoiced) {
          if (normalized !== 0) {
            cell.effective = planCashSign(row.section, normalized, row.canonicalKey);
            cell.layer = "plan";
          } else if (cell.committed && cell.committed.total !== 0) {
            cell.effective =
              row.section === "INGRESOS" ? cell.committed.total : -cell.committed.total;
            cell.layer = "committed";
          } else {
            cell.effective = 0;
            cell.layer = "empty";
          }
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
          body: JSON.stringify({ rowId, weekStart, amount: normalized }),
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error ?? "Error al guardar");
        const saved = json.data as { amount: number };
        if (saved.amount !== normalized) void refetch();
      } catch (err) {
        if (prev) setData(prev);
        throw err instanceof Error ? err : new Error("No se pudo guardar la celda");
      }
    },
    [data?.rows, refetch],
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

  /** Restaura notas de celda (PATCH) sin toast; el caller suele refetch después. */
  const restoreNotes = useCallback(
    async (
      rowId: string,
      cells: Array<{ weekStart: string; body: string | null }>,
    ): Promise<void> => {
      await Promise.all(
        cells.map(async (c) => {
          const res = await fetch("/api/finance/flow-v3/plan/note", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rowId, weekStart: c.weekStart, body: c.body }),
          });
          const json = await res.json();
          if (!json.success) throw new Error(json.error ?? "No se pudo restaurar la nota");
        }),
      );
    },
    [],
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

  /** Mueve el plan de una semana a otra (misma fila) + entrada de deshacer.
   *  El servidor también traslada la nota de celda; el undo restaura montos y notas. */
  const movePlan = useCallback(
    async (rowId: string, fromWeek: string, toWeek: string, opts?: MutateOpts) => {
      if (fromWeek === toWeek) return null;
      const prevFrom = readCellPlan(rowId, fromWeek);
      if (prevFrom === 0) return null; // nada que mover
      const prevTo = readCellPlan(rowId, toWeek);
      const prevFromNote = readCellNote(rowId, fromWeek);
      const prevToNote = readCellNote(rowId, toWeek);
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
          undo: async () => {
            await restoreNotes(rowId, [
              { weekStart: fromWeek, body: prevFromNote },
              { weekStart: toWeek, body: prevToNote },
            ]);
            await restoreCells(rowId, [
              { weekStart: fromWeek, amount: prevFrom },
              { weekStart: toWeek, amount: prevTo },
            ]);
          },
          redo: () => applyMove(rowId, fromWeek, toWeek),
        });
      }
      toast.success(prevTo !== 0 ? "Plan movido y sumado en la semana destino" : "Plan movido");
      return { ok: true as const, summed: prevTo !== 0 };
    },
    [applyMove, focusOf, history, readCellNote, readCellPlan, restoreCells, restoreNotes, rowName],
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

  /** Guarda / borra nota de celda. `silent` suprime toast (autoguardado). */
  const patchCellNote = useCallback(
    async (
      rowId: string,
      weekStart: string,
      body: string | null,
      opts?: { silent?: boolean; applyToFuturePlanCells?: boolean },
    ): Promise<boolean> => {
      try {
        const res = await fetch("/api/finance/flow-v3/plan/note", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rowId,
            weekStart,
            body,
            applyToFuturePlanCells: opts?.applyToFuturePlanCells === true,
          }),
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error ?? "No se pudo guardar la nota");
        const trimmed = body?.trim() || null;
        const applied: string[] | undefined = json.data?.appliedWeeks;
        setData((prev) => {
          if (!prev) return prev;
          const weekSet = applied ? new Set(applied) : new Set([weekStart]);
          return {
            ...prev,
            rows: prev.rows.map((r) => {
              if (r.id !== rowId) return r;
              return {
                ...r,
                cells: r.cells.map((c) =>
                  weekSet.has(c.weekStart) ? { ...c, note: trimmed } : c,
                ),
              };
            }),
          };
        });
        if (!opts?.silent) {
          if (applied && applied.length > 1) {
            toast.success(
              trimmed
                ? `Nota aplicada a ${applied.length} celdas`
                : `Nota eliminada en ${applied.length} celdas`,
            );
          } else {
            toast.success(trimmed ? "Nota guardada" : "Nota eliminada");
          }
        }
        return true;
      } catch (err) {
        if (!opts?.silent) {
          toast.error(err instanceof Error ? err.message : "No se pudo guardar la nota");
        }
        return false;
      }
    },
    [],
  );

  const applySettlement = useCallback(
    async (
      rowId: string,
      weekStart: string,
      mode: "AUTO" | "CLOSED",
      projectedClp?: number,
    ): Promise<void> => {
      const res = await fetch("/api/finance/flow-v3/plan/settlement", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rowId, weekStart, mode, projectedClp }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "No se pudo actualizar la liquidación");
      // Optimista: marcar settlement en execution; refetch reconcilia effective.
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          rows: prev.rows.map((r) => {
            if (r.id !== rowId) return r;
            return {
              ...r,
              cells: r.cells.map((c) => {
                if (c.weekStart !== weekStart || !c.execution) return c;
                return {
                  ...c,
                  execution: {
                    ...c.execution,
                    settlement: mode,
                    state: mode === "CLOSED" ? "closed" : c.execution.state === "closed" ? "partial" : c.execution.state,
                    residual: mode === "CLOSED" ? 0 : c.execution.residual,
                  },
                };
              }),
            };
          }),
        };
      });
      await refetch();
    },
    [refetch],
  );

  const patchSettlement = useCallback(
    async (
      rowId: string,
      weekStart: string,
      mode: "AUTO" | "CLOSED",
      projectedClp?: number,
      opts?: MutateOpts,
    ): Promise<void> => {
      const focus = focusOf(rowId, weekStart);
      const name = rowName(rowId);
      const prevMode: "AUTO" | "CLOSED" = (() => {
        const row = data?.rows.find((r) => r.id === rowId);
        const cell = row?.cells.find((c) => c.weekStart === weekStart);
        return cell?.execution?.settlement === "CLOSED" ? "CLOSED" : "AUTO";
      })();
      if (prevMode === mode) return;
      try {
        await applySettlement(rowId, weekStart, mode, projectedClp);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo actualizar la liquidación");
        return;
      }
      if (!opts?.skipHistory) {
        history.push({
          label: `${mode === "CLOSED" ? "Dar por cumplido" : "Reabrir"} ${name} · ${fmtShortDate(weekStart)}`,
          focus,
          undo: () => applySettlement(rowId, weekStart, prevMode, projectedClp),
          redo: () => applySettlement(rowId, weekStart, mode, projectedClp),
        });
      }
      toast.success(mode === "CLOSED" ? "Proyección dada por cumplida" : "Proyección reabierta");
    },
    [applySettlement, data?.rows, focusOf, history, rowName],
  );

  /**
   * Cierra la celda origen y suma el residual al plan de la semana destino.
   * Una sola entrada de deshacer revierte ambas escrituras.
   */
  const moveResidual = useCallback(
    async (
      rowId: string,
      fromWeek: string,
      toWeek: string,
      residualCash: number,
      section: string,
      projectedClp?: number,
      opts?: MutateOpts,
    ): Promise<void> => {
      if (fromWeek === toWeek || residualCash === 0) return;
      const prevFromPlan = readCellPlan(rowId, fromWeek);
      const prevToPlan = readCellPlan(rowId, toWeek);
      const prevMode: "AUTO" | "CLOSED" = (() => {
        const row = data?.rows.find((r) => r.id === rowId);
        const cell = row?.cells.find((c) => c.weekStart === fromWeek);
        return cell?.execution?.settlement === "CLOSED" ? "CLOSED" : "AUTO";
      })();
      // Plan destino: FINANCIAMIENTO signado; INGRESOS +; egresos magnitud +.
      const add =
        section === "FINANCIAMIENTO" || section === "INGRESOS"
          ? residualCash
          : Math.abs(residualCash);
      const nextToPlan = prevToPlan + add;
      const focus = focusOf(rowId, toWeek);
      const name = rowName(rowId);
      try {
        await applySettlement(rowId, fromWeek, "CLOSED", projectedClp);
        await applyPlanCell(rowId, toWeek, nextToPlan);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo mover el pendiente");
        await refetch();
        return;
      }
      if (!opts?.skipHistory) {
        history.push({
          label: `Mover pendiente ${name} → ${fmtShortDate(toWeek)}`,
          focus,
          undo: async () => {
            await applySettlement(rowId, fromWeek, prevMode, projectedClp);
            await restoreCells(rowId, [
              { weekStart: fromWeek, amount: prevFromPlan },
              { weekStart: toWeek, amount: prevToPlan },
            ]);
          },
          redo: async () => {
            await applySettlement(rowId, fromWeek, "CLOSED", projectedClp);
            await applyPlanCell(rowId, toWeek, nextToPlan);
          },
        });
      }
      toast.success("Pendiente movido a la próxima semana");
    },
    [
      applyPlanCell, applySettlement, data?.rows, focusOf, history,
      readCellPlan, refetch, restoreCells, rowName,
    ],
  );

  /** Ancla manual de saldo acumulado; recalcula hacia adelante vía refetch. */
  const patchBalanceAnchor = useCallback(
    async (weekStart: string, balanceClp: number | null): Promise<void> => {
      const res = await fetch("/api/finance/flow-v3/balance-anchor", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart, balanceClp }),
      });
      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error ?? "No se pudo guardar el saldo acumulado");
      }
      await refetch();
    },
    [refetch],
  );

  return {
    data, loading, granularity, setGranularity,
    extendPast, extendFuture, resetWindow, refetch,
    patchPlan, patchPlanBulk, movePlan, patchCellNote,
    patchSettlement, moveResidual, patchBalanceAnchor, undo, redo,
  };
}
