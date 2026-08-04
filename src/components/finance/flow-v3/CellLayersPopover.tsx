"use client";

import { useEffect, useRef, useState } from "react";
import type { FlowExcludedDte } from "@/modules/finance/flow-v3/types";
import type { FlowMatrixCellDto, FlowMatrixRowDto } from "@/modules/finance/flow-v3/matrix-types";
import { hasManualPlanOverride } from "@/modules/finance/flow-v3/cell-editability";
import { fmtClp, fmtShortDate } from "./format";
import { committedItemMeta, LAYER_LABEL, terminoStatusLine, toneClass } from "./cell-meta";

export interface PopoverState {
  row: FlowMatrixRowDto;
  cell: FlowMatrixCellDto;
  anchor: { left: number; top: number; bottom: number };
}

interface PlanHistoryEntry {
  id: string;
  createdAt: string;
  userEmail: string | null;
  previousAmount: number;
  newAmount: number;
}

interface Props {
  state: PopoverState | null;
  onClose: () => void;
  canManage?: boolean;
  excludedForRow?: FlowExcludedDte[];
  onViewDte?: (dteId: string) => void;
  onExcludeDte?: (dteId: string, reason: string) => Promise<void>;
  onRestoreDte?: (dteId: string) => Promise<void>;
}

/**
 * Visor simplificado de capas de una celda (v4.6).
 * Solo muestra capas con contenido; pagos reales como líneas clicables.
 */
export function CellLayersPopover({
  state, onClose, canManage, excludedForRow, onViewDte, onExcludeDte, onRestoreDte,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [excludingId, setExcludingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showExcluded, setShowExcluded] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<PlanHistoryEntry[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    if (!state) return;
    setExcludingId(null);
    setReason("");
    setReasonError(null);
    setShowExcluded(false);
    setShowHistory(false);
    setHistory(null);
  }, [state]);

  useEffect(() => {
    if (!state || !showHistory || history !== null) return;
    let cancelled = false;
    setHistoryLoading(true);
    void fetch(
      `/api/finance/flow-v3/plan/history?rowId=${encodeURIComponent(state.row.id)}&weekStart=${encodeURIComponent(state.cell.weekStart)}`,
    )
      .then((r) => r.json())
      .then((json: { success?: boolean; data?: PlanHistoryEntry[] }) => {
        if (!cancelled) setHistory(json.success ? (json.data ?? []) : []);
      })
      .catch(() => {
        if (!cancelled) setHistory([]);
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [state, showHistory, history]);

  useEffect(() => {
    if (!state) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (t && panelRef.current?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (excludingId) {
          setExcludingId(null);
          setReason("");
          setReasonError(null);
        } else onClose();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [state, onClose, excludingId]);

  if (!state) return null;
  const { row, cell } = state;
  const left = Math.max(8, Math.min(state.anchor.left, window.innerWidth - 328));
  const top = Math.min(state.anchor.bottom + 4, window.innerHeight - 340);
  const excluded = excludedForRow ?? [];
  const manualPlan = hasManualPlanOverride(cell.plan, cell.layer);

  const hasPlan = cell.plan !== 0 || manualPlan;
  const committedItems = cell.committed?.items ?? [];
  const hasCommitted = committedItems.length > 0;
  const realItems = cell.real?.items ?? [];
  const hasReal = realItems.length > 0;
  const realTotal = cell.real?.total ?? 0;

  const submitExclude = async () => {
    if (!excludingId || !onExcludeDte) return;
    const r = reason.trim();
    if (r.length < 5) {
      setReasonError("Indica el motivo (mín. 5 caracteres)");
      return;
    }
    setBusy(true);
    setReasonError(null);
    try {
      await onExcludeDte(excludingId, r);
      setExcludingId(null);
      setReason("");
    } finally {
      setBusy(false);
    }
  };

  const openDteOrBank = (dteId?: string, bankTransactionId?: string) => {
    if (dteId && onViewDte) {
      onViewDte(dteId);
      onClose();
      return;
    }
    if (bankTransactionId) {
      window.open(`/finanzas/conciliacion?tx=${bankTransactionId}`, "_blank", "noopener");
      onClose();
    }
  };

  const layerBlock = (title: string, active: boolean, body: React.ReactNode) => (
    <div
      className={`rounded border px-2 py-1.5 ${
        active ? "border-primary/50 bg-ds-surface-2" : "border-ds-border-subtle"
      }`}
    >
      <div className="mb-0.5 flex items-center justify-between">
        <span className="text-[12px] text-ds-text-3">{title}</span>
        {active && <span className="text-[12px] text-primary">efectiva</span>}
      </div>
      {body}
    </div>
  );

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={`Capas de ${row.name} · semana ${cell.weekStart}`}
      className="fixed z-50 w-[320px] space-y-1.5 rounded-lg border border-ds-border-default bg-ds-surface-3 p-2 text-xs shadow-lg"
      style={{ left, top }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate font-medium text-ds-text-1">{row.name}</span>
        <span className="shrink-0 text-[12px] text-ds-text-3">
          sem {fmtShortDate(cell.weekStart)} · {LAYER_LABEL[cell.layer]}
        </span>
      </div>

      {hasPlan && layerBlock(
        "Plan",
        cell.layer === "plan",
        <div className="space-y-0.5">
          <div className="flex items-center justify-end gap-1.5 text-ds-text-2">
            {manualPlan && (
              <span
                className="rounded border border-primary/40 px-1 text-[12px] leading-tight text-primary"
                title="Modificado manualmente"
              >
                manual
              </span>
            )}
            <span className="tabular-nums">{fmtClp(cell.plan)}</span>
          </div>
          {manualPlan && cell.committed && cell.committed.total !== 0 && (
            <p className="text-right text-[12px] text-ds-text-4">
              Proyección: {fmtClp(cell.committed.total)}
            </p>
          )}
        </div>,
      )}

      {hasCommitted && layerBlock(
        "Comprometido",
        cell.layer === "committed",
        <ul className="max-h-40 space-y-1 overflow-y-auto">
          {committedItems.map((it, i) => {
            const meta = committedItemMeta(it);
            const canExclude = canManage && it.kind === "dte" && !!it.dteId && !!onExcludeDte;
            const clickable = it.kind === "dte" && !!it.dteId && !!onViewDte;
            return (
              <li key={i} className="text-ds-text-2">
                <button
                  type="button"
                  disabled={!clickable}
                  onClick={() => it.dteId && openDteOrBank(it.dteId)}
                  className={`flex w-full items-center justify-between gap-2 text-left ${clickable ? "rounded px-0.5 hover:bg-ds-surface-2" : ""}`}
                >
                  <span className="flex min-w-0 items-center gap-1">
                    <span className={`shrink-0 font-sans tabular-nums ${toneClass(meta.tone)}`}>
                      {meta.tag}
                    </span>
                    <span className="truncate text-ds-text-3">
                      {it.overdueOver60 ? "⚠ " : ""}
                      {it.label}
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums">{fmtClp(it.monto)}</span>
                </button>
                <div className="flex items-center justify-between gap-2 pl-1 text-ds-text-4">
                  <span>
                    {it.kind === "dte"
                      ? `${it.emissionYmd ? fmtShortDate(it.emissionYmd) : fmtShortDate(it.fecha)}${
                          it.dueYmd ? ` · vence ${fmtShortDate(it.dueYmd)}` : ""
                        }`
                      : terminoStatusLine(it, fmtShortDate) || fmtShortDate(it.fecha)}
                  </span>
                  {canExclude && excludingId !== it.dteId && (
                    <button
                      type="button"
                      className="text-[12px] text-status-warn-fg underline-offset-2 hover:underline"
                      onClick={() => {
                        setExcludingId(it.dteId!);
                        setReason("");
                        setReasonError(null);
                      }}
                    >
                      Excluir…
                    </button>
                  )}
                </div>
                {excludingId === it.dteId && (
                  <div className="mt-1 space-y-1 rounded border border-status-warn-border bg-status-warn-soft/30 p-1.5">
                    <label className="block space-y-0.5">
                      <span className="text-[12px] text-status-warn-fg">
                        Motivo (mín. 5 caracteres)
                      </span>
                      <input
                        autoFocus
                        className="h-10 w-full rounded border border-ds-border-default bg-ds-surface-1 px-2 text-[13px] text-ds-text-1 sm:h-9"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Ej: cobrada por otra vía"
                        maxLength={300}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void submitExclude();
                          }
                        }}
                      />
                    </label>
                    {reasonError && (
                      <p className="text-[12px] text-status-danger-fg">{reasonError}</p>
                    )}
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        className="text-[12px] text-ds-text-3"
                        disabled={busy}
                        onClick={() => { setExcludingId(null); setReason(""); }}
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        className="text-[12px] font-medium text-status-warn-fg"
                        disabled={busy}
                        onClick={() => void submitExclude()}
                      >
                        {busy ? "Excluyendo…" : "Confirmar exclusión"}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>,
      )}

      {hasReal && layerBlock(
        `PAGOS RECIBIDOS · ${fmtClp(realTotal)}`,
        cell.layer === "real",
        <ul className="max-h-28 space-y-1 overflow-y-auto">
          {realItems.map((it, i) => {
            const clickable = !!(it.dteId || it.bankTransactionId);
            return (
              <li key={i}>
                <button
                  type="button"
                  disabled={!clickable}
                  onClick={() => openDteOrBank(it.dteId, it.bankTransactionId)}
                  className={`flex w-full justify-between gap-2 text-left text-ds-text-2 ${clickable ? "rounded px-0.5 hover:bg-ds-surface-2" : ""}`}
                >
                  <span className="truncate">
                    {fmtShortDate(it.fecha)} · {it.label}
                    {it.folio ? ` · F°${it.folio}` : ""}
                  </span>
                  <span className="shrink-0 tabular-nums">{fmtClp(it.monto)}</span>
                </button>
              </li>
            );
          })}
        </ul>,
      )}

      {excluded.length > 0 && (
        <div className="rounded border border-ds-border-subtle px-2 py-1.5">
          <button
            type="button"
            className="flex w-full items-center justify-between text-[12px] text-ds-text-3"
            onClick={() => setShowExcluded((v) => !v)}
            aria-expanded={showExcluded}
          >
            <span>Excluidas ({excluded.length})</span>
            <span aria-hidden>{showExcluded ? "▾" : "▸"}</span>
          </button>
          {showExcluded && (
            <ul className="mt-1 max-h-28 space-y-1 overflow-y-auto">
              {excluded.map((ex) => (
                <li key={ex.dteId} className="flex items-start justify-between gap-2 text-ds-text-2">
                  <span className="min-w-0">
                    <span className="truncate">
                      {ex.folio != null ? `F°${ex.folio}` : "Sin folio"} · {ex.label}
                    </span>
                    {ex.reason && (
                      <span className="block truncate text-[12px] text-ds-text-4">{ex.reason}</span>
                    )}
                  </span>
                  {canManage && onRestoreDte && (
                    <button
                      type="button"
                      className="shrink-0 text-[12px] text-status-info-fg underline-offset-2 hover:underline"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try { await onRestoreDte(ex.dteId); }
                        finally { setBusy(false); }
                      }}
                    >
                      Restaurar
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="rounded border border-ds-border-subtle px-2 py-1.5">
        <button
          type="button"
          className="flex w-full items-center justify-between text-[12px] text-ds-text-3"
          onClick={() => setShowHistory((v) => !v)}
          aria-expanded={showHistory}
        >
          <span>Historial</span>
          <span aria-hidden>{showHistory ? "▾" : "▸"}</span>
        </button>
        {showHistory && (
          historyLoading ? (
            <p className="mt-1 text-[12px] text-ds-text-4">Cargando…</p>
          ) : !history || history.length === 0 ? (
            <p className="mt-1 text-[12px] text-ds-text-4">
              Sin cambios manuales registrados en esta celda.
            </p>
          ) : (
            <ul className="mt-1 max-h-28 space-y-1 overflow-y-auto">
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
          )
        )}
      </div>
    </div>
  );
}
