"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  addWeeksUTC,
  defaultHorizon,
  toYmd,
  ymdToDate,
} from "@/modules/finance/flow-v3/weeks";
import type { FlowMatrixResponse } from "@/modules/finance/flow-v3/matrix-types";

const STEP_WEEKS = 8;

/**
 * Estado de la planilla: ventana móvil (default hoy−4sem → hoy+12m),
 * navegación por bloques de 8 semanas, toggle semanal/mensual y edición
 * optimista del plan con reconciliación read-after-write.
 */
export function usePlanillaMatrix() {
  const initial = useMemo(() => {
    const d = defaultHorizon(new Date());
    return { from: toYmd(d.from), to: toYmd(d.to) };
  }, []);
  const [window, setWindow] = useState(initial);
  const [granularity, setGranularity] = useState<"week" | "month">("week");
  const [data, setData] = useState<FlowMatrixResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const genRef = useRef(0);

  const fetchMatrix = useCallback(
    async (w: { from: string; to: string }, g: "week" | "month") => {
      const gen = ++genRef.current;
      setLoading(true);
      try {
        const params = new URLSearchParams({ from: w.from, to: w.to, horizon: g });
        const res = await fetch(`/api/finance/flow-v3/matrix?${params}`, { cache: "no-store" });
        const json = await res.json();
        if (gen !== genRef.current) return;
        if (!json.success) throw new Error(json.error ?? "Error");
        setData(json.data as FlowMatrixResponse);
      } catch (err) {
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
    void fetchMatrix(window, granularity);
  }, [window, granularity, fetchMatrix]);

  const shift = useCallback(
    (weeks: number) => {
      setWindow((w) => ({
        from: toYmd(addWeeksUTC(ymdToDate(w.from)!, weeks)),
        to: toYmd(addWeeksUTC(ymdToDate(w.to)!, weeks)),
      }));
    },
    [],
  );

  const goPrev = useCallback(() => shift(-STEP_WEEKS), [shift]);
  const goNext = useCallback(() => shift(STEP_WEEKS), [shift]);
  const goToday = useCallback(() => setWindow(initial), [initial]);
  const refetch = useCallback(() => fetchMatrix(window, granularity), [fetchMatrix, window, granularity]);

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
    goPrev, goNext, goToday, refetch, patchPlan,
  };
}
