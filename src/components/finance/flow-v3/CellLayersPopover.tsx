"use client";

import { useEffect, useRef, useState } from "react";
import type { FlowExcludedDte } from "@/modules/finance/flow-v3/types";
import type { FlowMatrixCellDto, FlowMatrixRowDto } from "@/modules/finance/flow-v3/matrix-types";
import { fmtClp, fmtShortDate } from "./format";
import { committedItemMeta, LAYER_LABEL, toneClass } from "./cell-meta";

export interface PopoverState {
  row: FlowMatrixRowDto;
  cell: FlowMatrixCellDto;
  anchor: { left: number; top: number; bottom: number };
}

interface Props {
  state: PopoverState | null;
  onClose: () => void;
  canManage?: boolean;
  excludedForRow?: FlowExcludedDte[];
  onExcludeDte?: (dteId: string, reason: string) => Promise<void>;
  onRestoreDte?: (dteId: string) => Promise<void>;
}

const MAPPING_LABEL: Record<string, string> = {
  ACCOUNT_INSTALLATION: "Cuenta CRM + instalación",
  CATEGORY: "Categoría de egreso",
  SUPPLIER: "Proveedor",
  MANUAL: "Manual",
};

/**
 * Visor de capas de una celda. Con canManage: acción "Excluir del flujo…"
 * por ítem dte + bloque "Excluidas (N)" con restaurar.
 */
export function CellLayersPopover({
  state, onClose, canManage, excludedForRow, onExcludeDte, onRestoreDte,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [excludingId, setExcludingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showExcluded, setShowExcluded] = useState(false);

  useEffect(() => {
    if (!state) return;
    setExcludingId(null);
    setReason("");
    setReasonError(null);
    setShowExcluded(false);
  }, [state]);

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
  const overdueN = (cell.committed?.items ?? []).filter((it) => it.overdueOver60).length;

  const block = (title: string, active: boolean, body: React.ReactNode) => (
    <div
      className={`rounded border px-2 py-1.5 ${
        active ? "border-primary/50 bg-ds-surface-2" : "border-ds-border-subtle"
      }`}
    >
      <div className="mb-0.5 flex items-center justify-between">
        <span className="text-[12px] text-ds-text-3">{title}</span>
        {active && (
          <span className="text-[12px] text-primary">efectiva</span>
        )}
      </div>
      {body}
    </div>
  );

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

      {overdueN > 0 && (
        <p className="rounded border border-status-warn-border bg-status-warn-soft/40 px-2 py-1 text-[12px] text-status-warn-fg">
          ⚠ {overdueN} vencida{overdueN === 1 ? "" : "s"} +60d
        </p>
      )}

      {block(
        "Plan",
        cell.layer === "plan",
        <div className="text-right text-ds-text-2">
          {cell.plan !== 0 ? fmtClp(cell.plan) : <span className="text-ds-text-4">sin plan</span>}
        </div>,
      )}

      {block(
        "Comprometido",
        cell.layer === "committed",
        cell.committed && cell.committed.items.length > 0 ? (
          <ul className="max-h-40 space-y-1 overflow-y-auto">
            {cell.committed.items.map((it, i) => {
              const meta = committedItemMeta(it);
              const canExclude = canManage && it.kind === "dte" && !!it.dteId && !!onExcludeDte;
              return (
                <li key={i} className="text-ds-text-2">
                  <div className="flex items-center justify-between gap-2">
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
                  </div>
                  <div className="flex items-center justify-between gap-2 text-ds-text-4">
                    <span>{fmtShortDate(it.fecha)}</span>
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
                        Excluir del flujo…
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
          </ul>
        ) : (
          <div className="text-right text-ds-text-4">—</div>
        ),
      )}

      {block(
        "Real",
        cell.layer === "real",
        cell.real && cell.real.items.length > 0 ? (
          <ul className="max-h-24 space-y-1 overflow-y-auto">
            {cell.real.items.map((it, i) => (
              <li key={i} className="flex justify-between gap-2 text-ds-text-2">
                <span className="truncate">
                  {fmtShortDate(it.fecha)} · {it.label}
                  {it.folio ? ` (F°${it.folio})` : ""}
                </span>
                <span className="shrink-0 tabular-nums">{fmtClp(it.monto)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-right text-ds-text-4">sin movimientos</div>
        ),
      )}

      {(excluded.length > 0 || canManage) && (
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
            excluded.length === 0 ? (
              <p className="mt-1 text-[12px] text-ds-text-4">Ninguna factura excluida en esta fila.</p>
            ) : (
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
            )
          )}
        </div>
      )}

      <div className="pt-0.5 text-[12px] text-ds-text-4">
        Mapping: {MAPPING_LABEL[row.mapping] ?? row.mapping}
        {row.isArchived ? " · fila archivada" : ""}
      </div>
    </div>
  );
}
