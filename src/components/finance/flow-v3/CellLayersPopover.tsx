"use client";

import { useState } from "react";
import type { FlowMatrixCellDto, FlowMatrixRowDto } from "@/modules/finance/flow-v3/matrix-types";
import { fmtClp, fmtShortDate } from "./format";

export interface PopoverState {
  row: FlowMatrixRowDto;
  cell: FlowMatrixCellDto;
  anchor: { left: number; top: number; bottom: number };
}

interface Props {
  state: PopoverState | null;
  canManage: boolean;
  onClose: () => void;
  onSetEndDate: (templateId: string, endDate: string | null) => void;
  /** Término de pago POR CONTRATO (días). null = default del tenant. */
  onSetDiasCobro: (templateId: string, diasCobro: number | null) => void;
}

const MAPPING_LABEL: Record<string, string> = {
  ACCOUNT_INSTALLATION: "Cuenta CRM + instalación",
  CATEGORY: "Categoría de egreso",
  SUPPLIER: "Proveedor",
  MANUAL: "Manual",
};

const LAYER_LABEL = { real: "Real", committed: "Comprometido", plan: "Plan", empty: "—" } as const;

export function CellLayersPopover({ state, canManage, onClose, onSetEndDate, onSetDiasCobro }: Props) {
  const [deferring, setDeferring] = useState<string | null>(null);
  const [newDate, setNewDate] = useState("");
  const [editingDias, setEditingDias] = useState<string | null>(null);
  const [newDias, setNewDias] = useState("");
  if (!state) return null;
  const { row, cell } = state;
  const left = Math.max(8, Math.min(state.anchor.left, window.innerWidth - 312));
  const top = Math.min(state.anchor.bottom + 4, window.innerHeight - 320);

  const section = (title: string, active: boolean, body: React.ReactNode) => (
    <div className={`rounded border px-2 py-1 ${active ? "border-primary/50 bg-ds-surface-2" : "border-ds-border-subtle"}`}>
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-wide text-ds-text-3">{title}</span>
        {active && <span className="font-mono text-[8px] uppercase text-primary">efectiva</span>}
      </div>
      {body}
    </div>
  );

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-label={`Capas de ${row.name} · semana ${cell.weekStart}`}
        className="fixed z-50 w-[304px] space-y-1.5 rounded-lg border border-ds-border-default bg-ds-surface-3 p-2 text-xs shadow-lg"
        style={{ left, top }}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate font-medium text-ds-text-1">{row.name}</span>
          <span className="shrink-0 font-mono text-[11px] uppercase tracking-wide text-ds-text-3">
            sem {fmtShortDate(cell.weekStart)} · {LAYER_LABEL[cell.layer]}
          </span>
        </div>

        {section("Plan", cell.layer === "plan",
          <div className="text-right text-ds-text-2">{cell.plan !== 0 ? fmtClp(cell.plan) : "sin plan"}</div>,
        )}

        {section("Comprometido", cell.layer === "committed",
          cell.committed && cell.committed.items.length > 0 ? (
            <ul className="max-h-32 space-y-0.5 overflow-y-auto">
              {cell.committed.items.map((it, i) => (
                <li key={i} className="text-ds-text-2">
                  <div className="flex justify-between gap-2">
                    <span className="truncate">
                      {it.kind === "dte" ? `F°${it.folio ?? "?"} · ` : "Prog · "}
                      {it.label}
                    </span>
                    <span className="shrink-0">{fmtClp(it.monto)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs text-ds-text-4">
                    <span>{fmtShortDate(it.fecha)}</span>
                    {it.kind === "scheduled" && it.templateId && (
                      deferring === it.templateId ? (
                        <span className="flex items-center gap-1">
                          <input
                            type="date"
                            value={newDate}
                            onChange={(e) => setNewDate(e.target.value)}
                            className="h-5 rounded border border-ds-border-default bg-ds-surface-1 px-1 text-xs text-ds-text-1"
                          />
                          <button
                            className="rounded bg-primary px-1 py-0.5 text-xs text-primary-foreground disabled:opacity-50"
                            disabled={!newDate}
                            onClick={() => { onSetEndDate(it.templateId!, newDate); onClose(); }}
                          >
                            OK
                          </button>
                        </span>
                      ) : (
                        <span className="flex flex-wrap items-center justify-end gap-1">
                          <span>{it.endDate ? `hasta ${fmtShortDate(it.endDate)}` : "sin término"}</span>
                          {canManage && (
                            <button
                              className="rounded border border-ds-border-default px-1 py-0.5 text-xs text-primary hover:bg-ds-surface-2"
                              onClick={() => { setDeferring(it.templateId!); setNewDate(it.endDate ?? ""); }}
                            >
                              Aplazar término
                            </button>
                          )}
                          {editingDias === it.templateId ? (
                            <span className="flex items-center gap-1">
                              <input
                                type="number"
                                min={0}
                                max={180}
                                value={newDias}
                                onChange={(e) => setNewDias(e.target.value)}
                                placeholder="30"
                                className="h-5 w-14 rounded border border-ds-border-default bg-ds-surface-1 px-1 text-right text-xs text-ds-text-1"
                              />
                              <button
                                className="rounded bg-primary px-1 py-0.5 text-xs text-primary-foreground"
                                onClick={() => {
                                  const n = newDias.trim() === "" ? null : Number(newDias);
                                  onSetDiasCobro(it.templateId!, n);
                                  onClose();
                                }}
                              >
                                OK
                              </button>
                            </span>
                          ) : (
                            <span className="flex items-center gap-1">
                              <span>
                                · cobro {it.diasCobro != null ? `${it.diasCobro}d` : "según config"}
                              </span>
                              {canManage && (
                                <button
                                  className="rounded border border-ds-border-default px-1 py-0.5 text-xs text-primary hover:bg-ds-surface-2"
                                  onClick={() => {
                                    setEditingDias(it.templateId!);
                                    setNewDias(it.diasCobro != null ? String(it.diasCobro) : "");
                                  }}
                                >
                                  Editar
                                </button>
                              )}
                            </span>
                          )}
                        </span>
                      )
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-right text-ds-text-4">—</div>
          ),
        )}

        {section("Real", cell.layer === "real",
          cell.real && cell.real.items.length > 0 ? (
            <ul className="max-h-24 space-y-0.5 overflow-y-auto">
              {cell.real.items.map((it, i) => (
                <li key={i} className="flex justify-between gap-2 text-ds-text-2">
                  <span className="truncate">
                    {fmtShortDate(it.fecha)} · {it.label}
                    {it.folio ? ` (F°${it.folio})` : ""}
                  </span>
                  <span className="shrink-0">{fmtClp(it.monto)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-right text-ds-text-4">sin movimientos</div>
          ),
        )}

        <div className="pt-0.5 font-mono text-[11px] uppercase tracking-wide text-ds-text-4">
          Mapping: {MAPPING_LABEL[row.mapping] ?? row.mapping}
          {row.isArchived ? " · fila cerrada" : ""}
        </div>
      </div>
    </>
  );
}
