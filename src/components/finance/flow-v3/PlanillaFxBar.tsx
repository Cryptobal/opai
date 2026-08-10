"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { FlowMatrixCellDto, FlowMatrixRowDto } from "@/modules/finance/flow-v3/matrix-types";
import { columnLetter } from "./column-letter";
import { fmtClp, fmtDayMonth, formatThousands } from "./format";
import { committedItemMeta, primaryCellTag, toneClass } from "./cell-meta";
import { displayValue } from "./grid-classes";
import { tryEvalArithmetic } from "./eval-arithmetic";

export interface FxSelection {
  rowNumber: number;
  rowName: string;
  colIdx: number;
  weekStart: string;
  row?: FlowMatrixRowDto;
  cell?: FlowMatrixCellDto;
  balanceKind?: "flow" | "balance";
  balanceValue?: number;
}

interface Props {
  selection: FxSelection | null;
  onOpenLayers: () => void;
  /** Celda editable → campo ƒx acepta input. */
  editable?: boolean;
  editReason?: string;
  onCommitPlan?: (raw: string) => void;
  onFxBlurFocusGrid?: () => void;
}

/**
 * Barra fx (30px): name box + composición / editor de plan + chip de nota.
 */
export function PlanillaFxBar({
  selection, onOpenLayers, editable, editReason, onCommitPlan, onFxBlurFocusGrid,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const ref =
    selection != null
      ? `${columnLetter(selection.colIdx + 1)}${selection.rowNumber}`
      : "";

  useEffect(() => {
    setEditing(false);
    setHint(null);
  }, [selection?.rowNumber, selection?.colIdx, selection?.weekStart]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const startEdit = () => {
    if (!editable || !selection?.cell || !onCommitPlan) return;
    setValue(selection.cell.plan !== 0 ? formatThousands(String(Math.abs(selection.cell.plan))) : "");
    setHint(null);
    setEditing(true);
  };

  const format = (raw: string) => {
    if (raw.trimStart().startsWith("=")) return raw;
    const neg = raw.trim().startsWith("-") ? "-" : "";
    return neg + formatThousands(raw);
  };

  const commit = () => {
    if (!onCommitPlan) return;
    const evaled = tryEvalArithmetic(value);
    if (evaled) {
      if (!evaled.ok) { setHint(evaled.reason); return; }
      onCommitPlan(String(evaled.value));
    } else {
      onCommitPlan(value);
    }
    setEditing(false);
    onFxBlurFocusGrid?.();
  };

  const cancel = () => {
    setEditing(false);
    setHint(null);
    onFxBlurFocusGrid?.();
  };

  let body: ReactNode = (
    <span className="planilla-fx-placeholder text-ds-text-3">Selecciona una celda</span>
  );

  if (selection?.balanceKind === "flow") {
    body = (
      <span className="truncate">
        <span className="font-medium text-ds-text-1">FLUJO SEMANA</span>
        <span className="text-ds-text-3"> · S · {fmtDayMonth(selection.weekStart)} · </span>
        <span className="tabular-nums text-ds-text-1">{fmtClp(selection.balanceValue ?? 0)}</span>
        <span className="text-ds-text-3"> · = ingresos − egresos</span>
      </span>
    );
  } else if (selection?.balanceKind === "balance") {
    body = (
      <span className="truncate">
        <span className="font-medium text-ds-text-1">SALDO</span>
        <span className="text-ds-text-3"> · {fmtDayMonth(selection.weekStart)} · </span>
        <span className="tabular-nums text-ds-text-1">{fmtClp(selection.balanceValue ?? 0)}</span>
        <span className="text-ds-text-3"> · = saldo anterior + flujo semana</span>
      </span>
    );
  } else if (selection?.cell && selection.row) {
    const { cell, row } = selection;
    const tag = primaryCellTag(cell);
    const cellValue = displayValue(row.section, cell.layer, cell.effective);
    const items = cell.committed?.items ?? [];
    const note = cell.note?.trim();
    body = (
      <span className="flex min-w-0 items-center gap-1.5 truncate">
        <span className="truncate font-medium text-ds-text-1">{selection.rowName}</span>
        <span className="shrink-0 text-ds-text-4">·</span>
        <span className="shrink-0 text-ds-text-3">{fmtDayMonth(selection.weekStart)}</span>
        {tag && (
          <>
            <span className="shrink-0 text-ds-text-4">·</span>
            <span className={`shrink-0 font-medium ${toneClass(tag.tone)}`}>{tag.tag}</span>
          </>
        )}
        {cellValue !== 0 && (
          <>
            <span className="shrink-0 text-ds-text-4">·</span>
            <span className="shrink-0 tabular-nums text-ds-text-1">{fmtClp(cellValue)}</span>
          </>
        )}
        {(() => {
          const overdueN = items.filter((it) => it.overdueOver60).length;
          const folioParts = items.map((it) => committedItemMeta(it).title);
          const shown = folioParts.slice(0, 6);
          const more = folioParts.length - shown.length;
          return (
            <>
              {overdueN > 0 && (
                <span className="shrink-0 text-status-warn-fg">
                  ⚠ {overdueN} vencida{overdueN === 1 ? "" : "s"} +60d
                </span>
              )}
              {items.length > 0 && (
                <span className="truncate text-ds-text-3">
                  — {shown.join(", ")}
                  {more > 0 ? ` +${more} más` : ""}
                  {items[0]?.label ? `: ${items[0].label}` : ""}
                </span>
              )}
            </>
          );
        })()}
        {cell.layer === "real" && cell.real?.items[0] && (
          <span className="truncate text-ds-text-3">— {cell.real.items[0].label}</span>
        )}
        {cell.layer === "plan" && (
          <span className="truncate text-ds-text-3">— plan manual</span>
        )}
        {note && (
          <span
            className="max-w-[140px] shrink truncate rounded bg-status-info-soft px-1.5 py-0.5 text-[12px] text-status-info-fg"
            title={note}
          >
            Nota: {note}
          </span>
        )}
      </span>
    );
  } else if (selection) {
    body = (
      <span className="truncate">
        <span className="font-medium text-ds-text-1">{selection.rowName}</span>
        <span className="text-ds-text-3"> · {fmtDayMonth(selection.weekStart)}</span>
      </span>
    );
  }

  const canLayers = !!(selection?.cell && (selection.cell.committed || selection.cell.real || selection.cell.plan !== 0 || selection.cell.note));
  const arith = editing ? tryEvalArithmetic(value) : null;
  const preview =
    arith?.ok === true
      ? `= ${arith.value.toLocaleString("es-CL")}`
      : arith?.ok === false
        ? arith.reason
        : null;

  return (
    <div
      className="planilla-chrome-print-hide hidden h-[var(--plnx-fxbar-h)] items-center gap-2 border-b border-ds-border-subtle bg-ds-surface-2 px-2 text-ds-text-1 lg:flex"
      role="status"
      aria-label="Barra de fórmula"
    >
      <div
        className="planilla-fx-input flex h-6 w-14 shrink-0 items-center justify-center rounded border border-ds-border-default bg-ds-surface-3 text-[12px] font-medium tabular-nums text-ds-text-1"
        title="Referencia de celda"
      >
        {ref || "—"}
      </div>
      <div
        className="planilla-fx-input relative flex h-6 min-w-0 flex-1 items-center gap-2 overflow-hidden rounded border border-ds-border-default bg-ds-surface-3 px-2 text-[12px] text-ds-text-1"
        title={!editable && editReason ? editReason : undefined}
        onClick={() => { if (!editing) startEdit(); }}
      >
        <span className="shrink-0 font-medium text-ds-text-2" aria-hidden>ƒx</span>
        {editing ? (
          <>
            {preview && (
              <span className={`pointer-events-none absolute -top-5 right-2 z-20 rounded bg-ds-surface-3 px-1 text-[12px] tabular-nums ${arith?.ok ? "text-status-ok-fg" : "text-status-warn-fg"}`}>
                {preview}
              </span>
            )}
            <input
              ref={inputRef}
              value={value}
              inputMode={value.trimStart().startsWith("=") ? "text" : "numeric"}
              onChange={(e) => { setHint(null); setValue(format(e.target.value)); }}
              onKeyDown={(e) => {
                e.stopPropagation();
                const mod = e.metaKey || e.ctrlKey;
                if (mod && (e.key === "a" || e.key === "A")) {
                  e.preventDefault();
                  e.currentTarget.select();
                  return;
                }
                if (e.key === "Enter") { e.preventDefault(); commit(); }
                else if (e.key === "Escape") { e.preventDefault(); cancel(); }
              }}
              onBlur={() => commit()}
              className="h-full min-w-0 flex-1 bg-transparent text-[12px] font-normal tabular-nums text-ds-text-1 outline-none"
              aria-invalid={!!hint}
              title={hint ?? undefined}
            />
          </>
        ) : (
          body
        )}
      </div>
      <button
        type="button"
        disabled={!canLayers}
        onClick={onOpenLayers}
        className="h-6 shrink-0 rounded border border-ds-border-default bg-ds-surface-3 px-2 text-[12px] font-medium text-ds-text-1 hover:bg-ds-surface-4 disabled:opacity-40"
      >
        Ver capas
      </button>
    </div>
  );
}
