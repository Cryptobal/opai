"use client";

import { useState } from "react";
import type { FlowExcludedDte } from "@/modules/finance/flow-v3/types";
import type { FlowMatrixCellDto } from "@/modules/finance/flow-v3/matrix-types";
import { hasManualPlanOverride } from "@/modules/finance/flow-v3/cell-editability";
import { fmtClp, fmtShortDate } from "./format";
import { committedItemMeta, terminoStatusLine, toneClass } from "./cell-meta";

interface Props {
  cell: FlowMatrixCellDto;
  canManage?: boolean;
  excluded?: FlowExcludedDte[];
  onViewDte?: (dteId: string) => void;
  onExcludeDte?: (dteId: string, reason: string) => Promise<void>;
  onRestoreDte?: (dteId: string) => Promise<void>;
  onClose: () => void;
}

function layerBlock(title: string, active: boolean, body: React.ReactNode) {
  return (
    <div className={`rounded border px-2 py-1.5 ${active ? "border-primary/50 bg-ds-surface-2" : "border-ds-border-subtle"}`}>
      <div className="mb-0.5 flex items-center justify-between">
        <span className="text-[12px] text-ds-text-3">{title}</span>
        {active && <span className="text-[12px] text-primary">efectiva</span>}
      </div>
      {body}
    </div>
  );
}

/** Bloques de capas (Plan / Comprometido / Real / Excluidas). */
export function CellCompositionPanel({
  cell, canManage, excluded = [], onViewDte, onExcludeDte, onRestoreDte, onClose,
}: Props) {
  const [excludingId, setExcludingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showExcluded, setShowExcluded] = useState(false);

  const manualPlan = hasManualPlanOverride(cell.plan, cell.layer);
  const hasPlan = cell.plan !== 0 || manualPlan;
  const committedItems = cell.committed?.items ?? [];
  const hasCommitted = committedItems.length > 0;
  const realItems = cell.real?.items ?? [];
  const hasReal = realItems.length > 0;
  const realTotal = cell.real?.total ?? 0;

  const openDteOrBank = (dteId?: string, bankTransactionId?: string) => {
    if (dteId && onViewDte) { onViewDte(dteId); onClose(); return; }
    if (bankTransactionId) {
      window.open(`/finanzas/conciliacion?tx=${bankTransactionId}`, "_blank", "noopener");
      onClose();
    }
  };

  const submitExclude = async () => {
    if (!excludingId || !onExcludeDte) return;
    const r = reason.trim();
    if (r.length < 5) { setReasonError("Indica el motivo (mín. 5 caracteres)"); return; }
    setBusy(true); setReasonError(null);
    try { await onExcludeDte(excludingId, r); setExcludingId(null); setReason(""); }
    finally { setBusy(false); }
  };

  return (
    <>
      {hasPlan && layerBlock("Plan", cell.layer === "plan", (
        <div className="space-y-0.5">
          <div className="flex items-center justify-end gap-1.5 text-ds-text-2">
            {manualPlan && (
              <span className="rounded border border-primary/40 px-1 text-[12px] leading-tight text-primary" title="Modificado manualmente">manual</span>
            )}
            <span className="tabular-nums">{fmtClp(cell.plan)}</span>
          </div>
          {manualPlan && cell.committed && cell.committed.total !== 0 && (
            <p className="text-right text-[12px] text-ds-text-4">Proyección: {fmtClp(cell.committed.total)}</p>
          )}
        </div>
      ))}

      {hasCommitted && layerBlock("Comprometido", cell.layer === "committed", (
        <ul className="max-h-40 space-y-1 overflow-y-auto">
          {committedItems.map((it, i) => {
            const meta = committedItemMeta(it);
            const canExclude = canManage && it.kind === "dte" && !!it.dteId && !!onExcludeDte;
            const clickable = it.kind === "dte" && !!it.dteId && !!onViewDte;
            return (
              <li key={i} className="text-ds-text-2">
                <button type="button" disabled={!clickable} onClick={() => it.dteId && openDteOrBank(it.dteId)}
                  className={`flex w-full items-center justify-between gap-2 text-left ${clickable ? "rounded px-0.5 hover:bg-ds-surface-2" : ""}`}>
                  <span className="flex min-w-0 items-center gap-1">
                    <span className={`shrink-0 font-sans tabular-nums ${toneClass(meta.tone)}`}>{meta.tag}</span>
                    <span className="truncate text-ds-text-3">{it.overdueOver60 ? "⚠ " : ""}{it.label}</span>
                  </span>
                  <span className="shrink-0 tabular-nums">{fmtClp(it.monto)}</span>
                </button>
                <div className="flex items-center justify-between gap-2 pl-1 text-ds-text-4">
                  <span>
                    {it.kind === "dte"
                      ? `${it.emissionYmd ? fmtShortDate(it.emissionYmd) : fmtShortDate(it.fecha)}${it.dueYmd ? ` · vence ${fmtShortDate(it.dueYmd)}` : ""}`
                      : terminoStatusLine(it, fmtShortDate) || fmtShortDate(it.fecha)}
                  </span>
                  {canExclude && excludingId !== it.dteId && (
                    <button type="button" className="text-[12px] text-status-warn-fg underline-offset-2 hover:underline"
                      onClick={() => { setExcludingId(it.dteId!); setReason(""); setReasonError(null); }}>Excluir…</button>
                  )}
                </div>
                {excludingId === it.dteId && (
                  <div className="mt-1 space-y-1 rounded border border-status-warn-border bg-status-warn-soft/30 p-1.5">
                    <label className="block space-y-0.5">
                      <span className="text-[12px] text-status-warn-fg">Motivo (mín. 5 caracteres)</span>
                      <input autoFocus className="h-10 w-full rounded border border-ds-border-default bg-ds-surface-1 px-2 text-[13px] text-ds-text-1 sm:h-9"
                        value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej: cobrada por otra vía" maxLength={300}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void submitExclude(); } }} />
                    </label>
                    {reasonError && <p className="text-[12px] text-status-danger-fg">{reasonError}</p>}
                    <div className="flex justify-end gap-2">
                      <button type="button" className="text-[12px] text-ds-text-3" disabled={busy}
                        onClick={() => { setExcludingId(null); setReason(""); }}>Cancelar</button>
                      <button type="button" className="text-[12px] font-medium text-status-warn-fg" disabled={busy}
                        onClick={() => void submitExclude()}>{busy ? "Excluyendo…" : "Confirmar exclusión"}</button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ))}

      {(cell.layer === "real" || hasReal) && cell.drift != null && (
        <div className="space-y-0.5 rounded border border-ds-border-subtle px-2 py-1.5">
          <div className="mb-0.5 text-[12px] text-ds-text-3">Desviación</div>
          <div className="flex justify-between gap-2 text-ds-text-2"><span>Proyectado</span><span className="tabular-nums">{cell.projected != null ? fmtClp(cell.projected) : "—"}</span></div>
          <div className="flex justify-between gap-2 text-ds-text-2"><span>Real</span><span className="tabular-nums">{fmtClp(Math.abs(realTotal))}</span></div>
          <div className="flex justify-between gap-2">
            <span className="text-ds-text-2">Desviación</span>
            <span className={`tabular-nums ${cell.drift.delta === 0 ? "text-ds-text-2" : cell.drift.delta > 0 ? "text-status-ok-fg" : "text-status-danger-fg"}`}>
              {cell.drift.delta > 0 ? "▲" : cell.drift.delta < 0 ? "▼" : "·"} {fmtClp(Math.abs(cell.drift.delta))}
              {cell.drift.pct != null && <span className="ml-1 text-[12px]">({cell.drift.pct > 0 ? "+" : ""}{cell.drift.pct.toFixed(1)}%)</span>}
            </span>
          </div>
        </div>
      )}

      {hasReal && layerBlock(`PAGOS RECIBIDOS · ${fmtClp(realTotal)}`, cell.layer === "real", (
        <ul className="max-h-28 space-y-1 overflow-y-auto">
          {realItems.map((it, i) => {
            const clickable = !!(it.dteId || it.bankTransactionId);
            return (
              <li key={i}>
                <button type="button" disabled={!clickable} onClick={() => openDteOrBank(it.dteId, it.bankTransactionId)}
                  className={`flex w-full justify-between gap-2 text-left text-ds-text-2 ${clickable ? "rounded px-0.5 hover:bg-ds-surface-2" : ""}`}>
                  <span className="truncate">{fmtShortDate(it.fecha)} · {it.label}{it.folio ? ` · F°${it.folio}` : ""}</span>
                  <span className="shrink-0 tabular-nums">{fmtClp(it.monto)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ))}

      {excluded.length > 0 && (
        <div className="rounded border border-ds-border-subtle px-2 py-1.5">
          <button type="button" className="flex w-full items-center justify-between text-[12px] text-ds-text-3"
            onClick={() => setShowExcluded((v) => !v)} aria-expanded={showExcluded}>
            <span>Excluidas ({excluded.length})</span>
            <span aria-hidden>{showExcluded ? "▾" : "▸"}</span>
          </button>
          {showExcluded && (
            <ul className="mt-1 max-h-28 space-y-1 overflow-y-auto">
              {excluded.map((ex) => (
                <li key={ex.dteId} className="flex items-start justify-between gap-2 text-ds-text-2">
                  <span className="min-w-0">
                    <span className="truncate">{ex.folio != null ? `F°${ex.folio}` : "Sin folio"} · {ex.label}</span>
                    {ex.reason && <span className="block truncate text-[12px] text-ds-text-4">{ex.reason}</span>}
                  </span>
                  {canManage && onRestoreDte && (
                    <button type="button" className="shrink-0 text-[12px] text-status-info-fg underline-offset-2 hover:underline" disabled={busy}
                      onClick={async () => { setBusy(true); try { await onRestoreDte(ex.dteId); } finally { setBusy(false); } }}>
                      Restaurar
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}
