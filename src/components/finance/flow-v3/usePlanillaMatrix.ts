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

const STEP_WEEKS = 8;

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
 * Edición optimista del plan con reconciliación read-after-write.
 */
export function usePlanillaMatrix() {
  const [window_, setWindow] = useState(initialWindow);
  const [granularity, setGranularity] = useState<"week" | "month">("week");
  const [data, setData] = useState<FlowMatrixResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const genRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

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

  /** Desplaza el horizonte completo (solo se usa al llegar a un borde). */
  const shiftWindow = useCallback((weeks: number) => {
    setWindow((w) => ({
      from: toYmd(addWeeksUTC(ymdToDate(w.from)!, weeks)),
      to: toYmd(addWeeksUTC(ymdToDate(w.to)!, weeks)),
    }));
  }, []);

  const extendPast = useCallback(() => shiftWindow(-STEP_WEEKS), [shiftWindow]);
  const extendFuture = useCallback(() => shiftWindow(STEP_WEEKS), [shiftWindow]);

  /** Vuelve al horizonte default. Devuelve true si hubo cambio (refetch). */
  const resetWindow = useCallback(() => {
    const init = initialWindow();
    let changed = false;
    setWindow((w) => {
      if (w.from === init.from && w.to === init.to) return w;
      changed = true;
      return init;
    });
    return changed;
  }, []);

  const refetch = useCallback(
    () => fetchMatrix(window_, granularity),
    [fetchMatrix, window_, granularity],
  );

  /** PATCH optimista del plan: recalcula efectivo/flujo/saldo en cliente y
   *  reconcilia con la celda que devuelve el server (Verdad Verificada). */
  const patchPlan = useCallback(
    async (rowId: string, weekStart: string, amount: number) => {
      let prev: FlowMatrixResponse | null = null;
      setData((d) => {
        if (!d) return d;
        prev = d;
        const rows = d.rows.map((r) => {
          if (r.id !== rowId) return r;
          return { ...r, cells: r.cells.map((c) => (c.weekStart === weekStart ? { ...c } : c)) };
        });
        const next = { ...d, rows, flows: [...d.flows], balances: [...d.balances] };
        const row = next.rows.find((r) => r.id === rowId);
        const colIdx = next.columns.findIndex((c) => c.key === weekStart);
        const cell = row?.cells[colIdx];
        if (!row || !cell || colIdx < 0) return next;
        const sign =
          row.section === "INGRESOS" || row.section === "FINANCIAMIENTO" ? 1 : -1;
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
        toast.error(err instanceof Error ? err.message : "No se pudo guardar la celda");
        if (prev) setData(prev);
      }
    },
    [refetch],
  );

  return {
    data, loading, granularity, setGranularity,
    extendPast, extendFuture, resetWindow, refetch, patchPlan,
  };
}
