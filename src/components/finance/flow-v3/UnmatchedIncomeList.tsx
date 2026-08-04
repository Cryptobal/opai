"use client";

import { useEffect, useState } from "react";
import { fmtClp } from "./format";
import { Spinner } from "@/components/opai-ds";

interface DteRow {
  dteId: string;
  folio: number | null;
  receiverName: string | null;
  receiverRut: string | null;
  amountClp: number;
}

/** Lista DTEs de "Otros ingresos" + acción crear fila. */
export function UnmatchedIncomeList({
  weekStart,
  onCreated,
}: {
  weekStart: string;
  onCreated: () => void;
}) {
  const [items, setItems] = useState<DteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetch(`/api/finance/flow-v3/unmatched-income?week=${weekStart}`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!j.success) throw new Error(j.error ?? "Error");
        if (!cancelled) setItems(j.data as DteRow[]);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [weekStart]);

  const createRow = async (dteId: string) => {
    setBusyId(dteId);
    setError(null);
    try {
      const res = await fetch("/api/finance/flow-v3/unmatched-income", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dteId }),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.error ?? "Error");
      setItems((prev) => prev.filter((x) => x.dteId !== dteId));
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-5 py-3 text-[12px] text-ds-text-4">
        <Spinner size="sm" /> Cargando facturas…
      </div>
    );
  }
  if (items.length === 0 && !error) return null;

  return (
    <div className="border-t border-ds-border-subtle px-5 py-3">
      <p className="mb-2 text-[12px] font-medium uppercase tracking-wide text-ds-text-3">
        Facturas en Otros ingresos
      </p>
      {error && <p className="mb-2 text-[12px] text-status-danger-fg">{error}</p>}
      <ul className="space-y-2">
        {items.map((d) => (
          <li
            key={d.dteId}
            className="flex flex-col gap-1 rounded-lg border border-ds-border-subtle bg-ds-surface-2 px-3 py-2"
          >
            <div className="flex items-baseline justify-between gap-2 text-[13px]">
              <span className="min-w-0 truncate font-medium text-ds-text-1">
                {d.folio != null ? `F°${d.folio}` : "Sin folio"} · {d.receiverName ?? "—"}
              </span>
              <span className="shrink-0 tabular-nums text-ds-text-1">{fmtClp(d.amountClp)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[12px] text-ds-text-4">{d.receiverRut ?? ""}</span>
              <button
                type="button"
                disabled={busyId === d.dteId}
                onClick={() => void createRow(d.dteId)}
                className="min-h-10 shrink-0 rounded-full bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground"
              >
                {busyId === d.dteId ? "Creando…" : "Crear fila para este cliente"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
