"use client";

import { useEffect, useState } from "react";
import { fmtClp, fmtShortDate } from "./format";

interface PlanHistoryEntry {
  id: string;
  createdAt: string;
  userEmail: string | null;
  previousAmount: number;
  newAmount: number;
}

interface Props {
  rowId: string;
  weekStart: string;
}

/** Historial de plan precargado al montar; aborta al desmontar/cambiar celda. */
export function CellHistoryList({ rowId, weekStart }: Props) {
  const [history, setHistory] = useState<PlanHistoryEntry[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setHistory(null);
    void fetch(
      `/api/finance/flow-v3/plan/history?rowId=${encodeURIComponent(rowId)}&weekStart=${encodeURIComponent(weekStart)}`,
      { signal: ac.signal },
    )
      .then((r) => r.json())
      .then((json: { success?: boolean; data?: PlanHistoryEntry[] }) => {
        setHistory(json.success ? (json.data ?? []) : []);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setHistory([]);
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
  }, [rowId, weekStart]);

  if (loading) {
    return <p className="text-[12px] text-ds-text-4">Cargando…</p>;
  }
  if (!history || history.length === 0) {
    return (
      <p className="text-[12px] text-ds-text-4">
        Sin cambios manuales registrados en esta celda.
      </p>
    );
  }

  return (
    <ul className="max-h-48 space-y-1 overflow-y-auto">
      {history.map((h) => (
        <li key={h.id} className="text-[12px] text-ds-text-2">
          <div className="flex justify-between gap-2 tabular-nums">
            <span>
              {h.previousAmount === 0 ? "—" : fmtClp(h.previousAmount)}
              {" → "}
              {h.newAmount === 0 ? "borrado" : fmtClp(h.newAmount)}
            </span>
            <span className="shrink-0 text-ds-text-4">
              {fmtShortDate(h.createdAt.slice(0, 10))}
            </span>
          </div>
          {h.userEmail && (
            <span className="block truncate text-ds-text-4">{h.userEmail}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
