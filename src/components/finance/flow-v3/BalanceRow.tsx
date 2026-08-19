"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { BalanceBreak, MatrixColumn } from "@/modules/finance/flow-v3/matrix-types";
import type { FlowMatrixRowDto } from "@/modules/finance/flow-v3/matrix-types";
import {
  currentWeekBalanceTitle,
  weekPendingBreakdown,
} from "@/modules/finance/flow-v3/balance-breakdown";
import { weekLabel } from "@/modules/finance/flow-v3/weeks";
import {
  fmtCell, fmtClp, formatThousands, NUM_CLASS, numSizeClass, type NumberFormatMode,
} from "./format";
import { COL_W, GUTTER_CELL, GUTTER_W, NAME_LEFT, NAME_W, TODAY_COL } from "./grid-classes";

interface Props {
  columns: MatrixColumn[];
  flows: number[];
  balances: number[];
  balanceBreaks?: Array<BalanceBreak | null>;
  warnThreshold: number;
  /** Número de gutter de la primera fila del resumen (correlativo de la hoja). */
  startNumber: number;
  numberFormat?: NumberFormatMode;
  selectedColIdx?: number | null;
  selectedColIndices?: Set<number>;
  /** Lunes ISO de semanas cerradas (no editables). */
  closedWeeks?: string[];
  /** Anclas manuales activas (lunes → CLP). */
  balanceAnchors?: Record<string, number>;
  canManage?: boolean;
  /** Persiste ancla; null borra. Granularidad week only. */
  onBalanceAnchor?: (weekStart: string, balanceClp: number | null) => Promise<void>;
  /** Banco hoy (ancla viva) + filas para desglose del saldo actual. */
  openingBalance?: number;
  rows?: FlowMatrixRowDto[];
}

const EYEBROW = "font-sans font-normal tabular-nums leading-none";

/** Heat del saldo: ok / warn (< umbral) / danger (< 0). */
function heatClass(balance: number, warnThreshold: number): string {
  if (balance < 0) return "bg-status-danger-soft text-status-danger-fg";
  if (balance < warnThreshold) return "bg-status-warn-soft text-status-warn-fg";
  return "bg-status-ok-soft/50 text-status-ok-fg";
}

function formatBalanceDraft(raw: string): string {
  const neg = raw.trim().startsWith("-") ? "-" : "";
  return neg + formatThousands(raw);
}

function parseClpInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "-") return null;
  const neg = trimmed.startsWith("-");
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;
  const n = Number(digits);
  if (!Number.isFinite(n)) return null;
  return neg ? -Math.round(n) : Math.round(n);
}

export function BalanceRow({
  columns, flows, balances, balanceBreaks, warnThreshold, startNumber, numberFormat = "clp",
  selectedColIdx, selectedColIndices,
  closedWeeks, balanceAnchors, canManage, onBalanceAnchor,
  openingBalance, rows,
}: Props) {
  const closedSet = new Set(closedWeeks ?? []);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editIdx == null) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [editIdx]);

  const nameTh = `planilla-name-col ${NAME_W} sticky ${NAME_LEFT} z-10 border-r border-t border-ds-border-default bg-ds-surface-2 px-1.5 max-md:px-1 text-left overflow-hidden whitespace-nowrap ${EYEBROW} text-ds-text-3`;
  const gutterTh = `${GUTTER_W} ${GUTTER_CELL} z-10 border-t border-ds-border-default`;
  const cellBase = `${COL_W} border-r border-t border-ds-border-subtle/60 px-1.5 max-md:px-[3px] text-right overflow-hidden whitespace-nowrap ${NUM_CLASS}`;
  const sel = (i: number) =>
    (selectedColIndices?.has(i) || selectedColIdx === i)
      ? "plnx-sel-cross-col"
      : "";

  const startEdit = useCallback(
    (i: number) => {
      if (!canManage || !onBalanceAnchor) return;
      const col = columns[i];
      if (!col) return;
      if (closedSet.has(col.key)) {
        toast.message("Semana cerrada", {
          description: "El saldo acumulado queda fijo. Reabre el cierre para editarlo.",
        });
        return;
      }
      // Espejo banco en vivo: actual/futuro siguen al saldo del banco + pendiente.
      if (!col.isPast) {
        toast.message("Saldo en vivo", {
          description: col.isCurrent
            ? "Esta semana sigue al banco de hoy más lo pendiente por conciliar."
            : "Las semanas futuras se proyectan desde el banco de hoy.",
        });
        return;
      }
      const bal = Math.round(balances[i] ?? 0);
      const seeded =
        bal === 0
          ? ""
          : (bal < 0 ? "-" : "") + formatThousands(String(Math.abs(bal)));
      setEditIdx(i);
      setDraft(seeded);
    },
    [canManage, onBalanceAnchor, columns, closedSet, balances],
  );

  const cancelEdit = useCallback(() => {
    setEditIdx(null);
    setDraft("");
  }, []);

  const commitEdit = useCallback(async () => {
    if (editIdx == null || !onBalanceAnchor) return;
    const col = columns[editIdx];
    if (!col) {
      cancelEdit();
      return;
    }
    const parsed = parseClpInput(draft);
    if (parsed == null) {
      if (balanceAnchors?.[col.key] != null) {
        setSaving(true);
        try {
          await onBalanceAnchor(col.key, null);
        } finally {
          setSaving(false);
        }
      }
      cancelEdit();
      return;
    }
    if (parsed === Math.round(balances[editIdx] ?? 0) && balanceAnchors?.[col.key] == null) {
      cancelEdit();
      return;
    }
    setSaving(true);
    try {
      await onBalanceAnchor(col.key, parsed);
    } finally {
      setSaving(false);
      cancelEdit();
    }
  }, [editIdx, onBalanceAnchor, columns, draft, balanceAnchors, balances, cancelEdit]);

  return (
    <tfoot className="sticky bottom-0 z-20">
      <tr className="h-[var(--plnx-row-h)] bg-ds-surface-2">
        <td aria-hidden className={gutterTh}>
          {startNumber}
        </td>
        <th scope="row" className={nameTh}>
          <span className="md:hidden">Flujo</span>
          <span className="max-md:hidden">Flujo semana</span>
        </th>
        {columns.map((c, i) => {
          const text = fmtCell(flows[i], numberFormat);
          return (
            <td
              key={c.key}
              title={numberFormat !== "clp" && flows[i] !== 0 ? fmtCell(flows[i], "clp") : undefined}
              className={`${cellBase} ${numSizeClass(text)} ${c.isCurrent ? TODAY_COL : ""} ${sel(i)} ${
                flows[i] < 0 ? "text-status-danger-fg" : flows[i] > 0 ? "text-status-ok-fg" : "text-ds-text-4"
              }`}
            >
              {text}
            </td>
          );
        })}
      </tr>
      <tr className="h-[var(--plnx-row-h)] bg-ds-surface-1">
        <td aria-hidden className={`${gutterTh} border-t-0`}>
          {startNumber + 1}
        </td>
        <th scope="row" className={`${nameTh} border-t-0`}>
          <span className="md:hidden">Saldo</span>
          <span className="max-md:hidden">Saldo acumulado</span>
        </th>
        {columns.map((c, i) => {
          const text = fmtCell(balances[i], numberFormat);
          const brk = balanceBreaks?.[i] ?? null;
          const anchored = balanceAnchors?.[c.key] != null;
          const closed = closedSet.has(c.key);
          const editable = !!canManage && !!onBalanceAnchor && !closed && c.isPast;
          const exactTitle = numberFormat !== "clp" && balances[i] !== 0 ? fmtCell(balances[i], "clp") : undefined;
          const breakTitle = brk
            ? `Descuadre no conciliado vs cierre ${weekLabel(brk.vsWeek)}: ${fmtClp(brk.delta)}`
            : undefined;
          const editHint = editable
            ? anchored
              ? "Ancla manual · clic para editar · vaciar para quitar"
              : "Clic para fijar saldo acumulado histórico"
            : closed
              ? "Semana cerrada — saldo fijo"
              : c.isCurrent && openingBalance != null && rows
                ? currentWeekBalanceTitle(
                    openingBalance,
                    weekPendingBreakdown(rows, i),
                    balances[i] ?? 0,
                  )
                : c.isCurrent
                  ? "Espejo banco hoy + pendiente por conciliar"
                : !c.isPast
                  ? "Proyección desde banco hoy"
                  : undefined;
          const title = [breakTitle, exactTitle, editHint].filter(Boolean).join(" · ") || undefined;

          if (editIdx === i) {
            return (
              <td
                key={c.key}
                className={`relative ${cellBase} border-t-0 font-semibold ${heatClass(balances[i], warnThreshold)} ${c.isCurrent ? TODAY_COL : ""} ${sel(i)} p-0`}
              >
                <input
                  ref={inputRef}
                  type="text"
                  inputMode="numeric"
                  disabled={saving}
                  value={draft}
                  onChange={(e) => setDraft(formatBalanceDraft(e.target.value))}
                  onBlur={() => void commitEdit()}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    const mod = e.metaKey || e.ctrlKey;
                    if (mod && (e.key === "a" || e.key === "A")) {
                      e.preventDefault();
                      e.currentTarget.select();
                      return;
                    }
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void commitEdit();
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      cancelEdit();
                    }
                  }}
                  className={`h-full w-full min-w-0 bg-transparent px-1.5 max-md:px-[3px] text-right text-ds-text-1 outline-none ${NUM_CLASS}`}
                  style={{ fontSize: "inherit", fontWeight: 600, lineHeight: "inherit" }}
                  aria-label={`Saldo acumulado ${weekLabel(c.key)}`}
                />
              </td>
            );
          }

          return (
            <td
              key={c.key}
              title={title}
              onClick={() => {
                if (editable) startEdit(i);
                else if (closed && canManage) startEdit(i); // toast
              }}
              className={`relative ${cellBase} border-t-0 font-semibold ${numSizeClass(text)} ${heatClass(balances[i], warnThreshold)} ${c.isCurrent ? TODAY_COL : ""} ${sel(i)} ${
                editable ? "cursor-text" : closed ? "cursor-not-allowed" : ""
              }`}
            >
              {brk && (
                <span
                  aria-label={breakTitle}
                  className="absolute right-0.5 top-0 text-[12px] leading-none text-status-warn-fg"
                >
                  ⚠
                </span>
              )}
              {anchored && !brk && (
                <span
                  aria-label="Saldo anclado manualmente"
                  className="absolute left-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-primary"
                />
              )}
              {text}
            </td>
          );
        })}
      </tr>
    </tfoot>
  );
}
