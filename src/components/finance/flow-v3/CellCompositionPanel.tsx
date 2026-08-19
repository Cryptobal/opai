"use client";

import { useState } from "react";
import type { FlowExcludedDte } from "@/modules/finance/flow-v3/types";
import type { FlowMatrixCellDto, MatrixColumn } from "@/modules/finance/flow-v3/matrix-types";
import { hasManualPlanOverride } from "@/modules/finance/flow-v3/cell-editability";
import { fmtClp, fmtDayMonth, fmtShortDate } from "./format";
import { resolveNextWeekKey } from "./menu-builders";
import { committedItemMeta, terminoStatusLine, toneClass } from "./cell-meta";

interface Props {
  cell: FlowMatrixCellDto;
  canManage?: boolean;
  /** Celda editable (plan) — habilita "Ajustar proyección al real". */
  editable?: boolean;
  editReason?: string;
  excluded?: FlowExcludedDte[];
  onViewDte?: (dteId: string) => void;
  onExcludeDte?: (dteId: string, reason: string) => Promise<void>;
  onRestoreDte?: (dteId: string) => Promise<void>;
  onSettleClosed?: () => void;
  onSettleReopen?: () => void;
  onMatchPlanToReal?: () => void;
  onMoveResidual?: () => void;
  /** Semanas abiertas para mover F° o P desde la composición. */
  moveWeeks?: MatrixColumn[];
  onMoveDte?: (dteId: string, targetWeek: string) => void;
  onMoveScheduled?: (templateId: string, billingPeriod: string, targetWeek: string) => void;
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
  cell, canManage, editable, editReason, excluded = [],
  onViewDte, onExcludeDte, onRestoreDte,
  onSettleClosed, onSettleReopen, onMatchPlanToReal, onMoveResidual,
  moveWeeks = [], onMoveDte, onMoveScheduled, onClose,
}: Props) {
  const [movingKey, setMovingKey] = useState<string | null>(null);
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
  const ex = cell.execution;
  const showExecution = !!ex && ex.state !== "none";
  const pctWidth = ex?.pct == null ? 0 : Math.min(100, Math.max(0, Math.round(ex.pct)));
  const canAct = !!canManage;
  const nextMoveWeekKey = resolveNextWeekKey(moveWeeks, cell.weekStart);

  const openDteOrBank = (dteId?: string, bankTransactionId?: string) => {
    if (dteId && onViewDte) { onViewDte(dteId); onClose(); return; }
    if (bankTransactionId) {
      // Banca abre el sheet del movimiento con ?txId=. `/finanzas/conciliacion`
      // es el módulo de cierres de período y no lee `?tx=`.
      window.open(`/finanzas/bancos?txId=${bankTransactionId}`, "_blank", "noopener");
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
            const schedKey =
              it.kind === "scheduled" && it.templateId && it.billingPeriod
                ? `sched:${it.templateId}::${it.billingPeriod}`
                : null;
            const dteKey = it.kind === "dte" && it.dteId ? `dte:${it.dteId}` : null;
            const itemKey = schedKey ?? dteKey;
            const canMoveItem =
              canManage &&
              moveWeeks.length > 0 &&
              ((schedKey && !!onMoveScheduled) || (dteKey && !!onMoveDte));
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
                  <span className="flex shrink-0 items-center gap-2">
                    {canMoveItem && itemKey && movingKey !== itemKey && (
                      <button type="button" className="min-h-11 text-[12px] text-status-info-fg underline-offset-2 hover:underline sm:min-h-0"
                        onClick={() => setMovingKey(itemKey)}>
                        {it.kind === "scheduled" ? "Mover esta P…" : "Mover esta F°…"}
                      </button>
                    )}
                    {canExclude && excludingId !== it.dteId && (
                      <button type="button" className="text-[12px] text-status-warn-fg underline-offset-2 hover:underline"
                        onClick={() => { setExcludingId(it.dteId!); setReason(""); setReasonError(null); }}>Excluir…</button>
                    )}
                  </span>
                </div>
                {movingKey === itemKey && itemKey && (
                  <ul className="mt-1 max-h-36 space-y-0.5 overflow-y-auto rounded border border-ds-border-subtle bg-ds-surface-1 p-1">
                    {moveWeeks.map((w) => {
                      const isNext = w.key === nextMoveWeekKey;
                      return (
                      <li key={w.key}>
                        <button
                          type="button"
                          className={`flex min-h-11 w-full items-center justify-between rounded px-1.5 text-left text-[13px] sm:min-h-9 ${
                            isNext
                              ? "bg-status-info-soft font-medium text-status-info-fg"
                              : "text-ds-text-1 hover:bg-ds-surface-2"
                          }`}
                          onClick={() => {
                            if (it.kind === "dte" && it.dteId && onMoveDte) onMoveDte(it.dteId, w.key);
                            if (
                              it.kind === "scheduled" &&
                              it.templateId &&
                              it.billingPeriod &&
                              onMoveScheduled
                            ) {
                              onMoveScheduled(it.templateId, it.billingPeriod, w.key);
                            }
                            setMovingKey(null);
                            onClose();
                          }}
                        >
                          <span>{w.label} · {fmtDayMonth(w.weekStart)}</span>
                          {isNext && (
                            <span className="shrink-0 text-[12px]">próxima semana</span>
                          )}
                        </button>
                      </li>
                      );
                    })}
                    <li>
                      <button type="button" className="min-h-11 w-full px-1.5 text-left text-[12px] text-ds-text-3 sm:min-h-9"
                        onClick={() => setMovingKey(null)}>Cancelar</button>
                    </li>
                  </ul>
                )}
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

      {showExecution && ex && (
        <div className="space-y-1 rounded border border-ds-border-subtle px-2 py-1.5">
          <div className="mb-0.5 flex items-center justify-between text-[12px] text-ds-text-3">
            <span>Ejecución</span>
            {ex.pct != null && (
              <span className="tabular-nums text-ds-text-2">{Math.round(ex.pct)}% ejecutado</span>
            )}
          </div>
          {(ex.state === "partial" || ex.state === "over") && (
            <div className="h-[2.5px] overflow-hidden rounded-sm bg-ds-border-strong/50">
              <div
                className={`h-full rounded-sm ${ex.state === "over" ? "bg-status-warn" : "bg-status-ok"}`}
                style={{ width: `${ex.state === "over" ? 100 : pctWidth}%` }}
              />
            </div>
          )}
          <div className="flex justify-between gap-2 text-ds-text-2">
            <span>Proyectado</span>
            <span className="tabular-nums">{fmtClp(ex.projected)}</span>
          </div>
          <div className="flex justify-between gap-2 text-ds-text-2">
            <span>Real</span>
            <span className="tabular-nums">{fmtClp(ex.real)}</span>
          </div>
          {ex.state === "over" ? (
            <div className="flex justify-between gap-2 text-status-warn-fg">
              <span>Sobre proyección</span>
              <span className="tabular-nums">▲ +{fmtClp(ex.over)}</span>
            </div>
          ) : (
            <div className="flex justify-between gap-2 text-status-info-fg">
              <span>Por ejecutar</span>
              <span className="tabular-nums">{fmtClp(Math.abs(ex.residual))}</span>
            </div>
          )}
          {canAct && (ex.state === "partial" || ex.state === "closed" || ex.state === "over") && (
            <div className="flex flex-col gap-1 border-t border-ds-border-subtle pt-1.5">
              {ex.state === "partial" && onSettleClosed && (
                <button
                  type="button"
                  className="min-h-11 rounded px-1 text-left text-[13px] text-ds-text-1 hover:bg-ds-surface-2 sm:min-h-9"
                  onClick={() => { onSettleClosed(); onClose(); }}
                >
                  Dar por cumplido
                </button>
              )}
              {ex.state === "closed" && onSettleReopen && (
                <button
                  type="button"
                  className="min-h-11 rounded px-1 text-left text-[13px] text-ds-text-1 hover:bg-ds-surface-2 sm:min-h-9"
                  onClick={() => { onSettleReopen(); onClose(); }}
                >
                  Reabrir proyección
                </button>
              )}
              {onMatchPlanToReal && (
                <button
                  type="button"
                  disabled={!editable}
                  title={!editable ? (editReason || "No editable") : undefined}
                  className="min-h-11 rounded px-1 text-left text-[13px] text-ds-text-1 hover:bg-ds-surface-2 disabled:opacity-40 sm:min-h-9"
                  onClick={() => { if (editable) { onMatchPlanToReal(); onClose(); } }}
                >
                  Ajustar proyección al real
                </button>
              )}
              {ex.state === "partial" && onMoveResidual && (
                <button
                  type="button"
                  disabled={!editable}
                  title={!editable ? (editReason || "No editable") : undefined}
                  className="min-h-11 rounded px-1 text-left text-[13px] text-ds-text-1 hover:bg-ds-surface-2 disabled:opacity-40 sm:min-h-9"
                  onClick={() => { if (editable) { onMoveResidual(); onClose(); } }}
                >
                  Mover pendiente a la próxima semana
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {!showExecution && (cell.layer === "real" || hasReal) && cell.drift != null && (
        <div className="space-y-0.5 rounded border border-ds-border-subtle px-2 py-1.5">
          <div className="mb-0.5 text-[12px] text-ds-text-3">Desviación</div>
          <div className="flex justify-between gap-2 text-ds-text-2"><span>Proyectado</span><span className="tabular-nums">{cell.projected != null ? fmtClp(cell.projected) : "—"}</span></div>
          <div className="flex justify-between gap-2 text-ds-text-2"><span>Real</span><span className="tabular-nums">{fmtClp(Math.abs(realTotal))}</span></div>
          <div className="flex justify-between gap-2">
            <span className="text-ds-text-2">Desviación</span>
            <span className={`tabular-nums ${cell.drift.delta === 0 ? "text-ds-text-2" : cell.drift.delta > 0 ? "text-status-ok-fg" : "text-status-danger-fg"}`}>
              {cell.drift.delta > 0 ? "▲" : cell.drift.delta < 0 ? "▼" : "·"} {fmtClp(Math.abs(cell.drift.delta))}
              {cell.drift.pct != null && <span className="ml-1 text-[12px]">({cell.drift.pct.toFixed(1)}%)</span>}
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
