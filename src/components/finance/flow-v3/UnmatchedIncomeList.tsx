"use client";

import { useEffect, useState } from "react";
import { fmtClp } from "./format";
import { Spinner } from "@/components/opai-ds";

interface TemplateOpt {
  id: string;
  name: string;
  suggestedBillingPeriod: string;
  periodHasOtherDte: boolean;
  isActive: boolean;
}

interface DteRow {
  dteId: string;
  folio: number | null;
  receiverName: string | null;
  receiverRut: string | null;
  amountClp: number;
  templates: TemplateOpt[];
}

/** Lista DTEs de "Otros ingresos" + crear fila / vincular a programación. */
export function UnmatchedIncomeList({
  weekStart,
  onCreated,
  focusDteId,
}: {
  weekStart: string;
  onCreated: () => void;
  /** Si viene, abre el picker de vincular para ese DTE. */
  focusDteId?: string | null;
}) {
  const [items, setItems] = useState<DteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [linkingDteId, setLinkingDteId] = useState<string | null>(null);

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

  useEffect(() => {
    if (focusDteId && items.some((i) => i.dteId === focusDteId)) {
      setLinkingDteId(focusDteId);
    }
  }, [focusDteId, items]);

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

  const linkTemplate = async (dteId: string, templateId: string, warn: boolean) => {
    if (warn) {
      const ok = window.confirm(
        "Este período ya tiene otra factura de la misma programación. ¿Vincular de todos modos? (ambas F° conviven; se suprime la cuota proyectada).",
      );
      if (!ok) return;
    }
    setBusyId(dteId);
    setError(null);
    try {
      const res = await fetch("/api/finance/flow-v3/unmatched-income/link-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dteId, templateId }),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.error ?? "Error");
      setItems((prev) => prev.filter((x) => x.dteId !== dteId));
      setLinkingDteId(null);
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

  const linking = linkingDteId ? items.find((i) => i.dteId === linkingDteId) : null;

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
            className="flex flex-col gap-1.5 rounded-lg border border-ds-border-subtle bg-ds-surface-2 px-3 py-2"
          >
            <div className="flex items-baseline justify-between gap-2 text-[13px]">
              <span className="min-w-0 truncate font-medium text-ds-text-1">
                {d.folio != null ? `F°${d.folio}` : "Sin folio"} · {d.receiverName ?? "—"}
              </span>
              <span className="shrink-0 tabular-nums text-ds-text-1">{fmtClp(d.amountClp)}</span>
            </div>
            <span className="truncate text-[12px] text-ds-text-4">{d.receiverRut ?? ""}</span>
            <div className="flex flex-wrap items-center gap-2">
              {(d.templates?.length ?? 0) > 0 && (
                <button
                  type="button"
                  disabled={busyId === d.dteId}
                  onClick={() => setLinkingDteId(d.dteId)}
                  className="min-h-10 shrink-0 rounded-full border border-ds-border-default bg-ds-surface-1 px-3 py-1.5 text-[12px] font-medium text-ds-text-1"
                >
                  Vincular a programación…
                </button>
              )}
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

      {/* Bottom-sheet selector de programación (<lg + desktop). */}
      {linking && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Vincular a programación"
          onClick={() => setLinkingDteId(null)}
        >
          <div
            className="opai-glass-strong w-full max-w-md rounded-t-2xl border border-ds-border-subtle bg-ds-surface-1 p-4 sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-1 text-[13px] font-medium text-ds-text-1">
              Vincular {linking.folio != null ? `F°${linking.folio}` : "factura"}
            </p>
            <p className="mb-3 text-[12px] text-ds-text-3">
              {linking.receiverName ?? "Cliente"} — elegí la programación
            </p>
            <ul className="max-h-[50vh] space-y-2 overflow-y-auto">
              {linking.templates.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    disabled={busyId === linking.dteId}
                    onClick={() => void linkTemplate(linking.dteId, t.id, t.periodHasOtherDte)}
                    className="flex min-h-11 w-full flex-col items-start gap-0.5 rounded-xl border border-ds-border-subtle bg-ds-surface-2 px-3 py-2.5 text-left transition-colors hover:border-primary/40"
                  >
                    <span className="text-[13px] font-medium text-ds-text-1">{t.name}</span>
                    <span className="text-[12px] text-ds-text-3">
                      Período {t.suggestedBillingPeriod}
                      {!t.isActive ? " · pausada" : ""}
                      {t.periodHasOtherDte ? " · ya hay F° en el período" : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setLinkingDteId(null)}
              className="mt-3 min-h-10 w-full rounded-full text-[13px] text-ds-text-3"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
