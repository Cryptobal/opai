"use client";

import { useEffect, useRef } from "react";
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
}

const MAPPING_LABEL: Record<string, string> = {
  ACCOUNT_INSTALLATION: "Cuenta CRM + instalación",
  CATEGORY: "Categoría de egreso",
  SUPPLIER: "Proveedor",
  MANUAL: "Manual",
};

/**
 * Visor de SOLO LECTURA de las capas de una celda (§5B). Cierra con Esc o
 * pointerdown fuera (sin overlay bloqueante: el clic exterior también llega
 * al botón del toolbar en el mismo gesto).
 */
export function CellLayersPopover({ state, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

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
        onClose();
      }
    };
    // pointerdown (burbuja): cierra sin preventDefault → el target recibe el click.
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [state, onClose]);

  if (!state) return null;
  const { row, cell } = state;
  const left = Math.max(8, Math.min(state.anchor.left, window.innerWidth - 328));
  const top = Math.min(state.anchor.bottom + 4, window.innerHeight - 340);

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
          <ul className="max-h-32 space-y-1 overflow-y-auto">
            {cell.committed.items.map((it, i) => {
              const meta = committedItemMeta(it);
              return (
                <li key={i} className="text-ds-text-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1">
                      <span className={`shrink-0 font-sans tabular-nums ${toneClass(meta.tone)}`}>
                        {meta.tag}
                      </span>
                      <span className="truncate text-ds-text-3">{it.label}</span>
                    </span>
                    <span className="shrink-0 tabular-nums">{fmtClp(it.monto)}</span>
                  </div>
                  <div className="text-ds-text-4">{fmtShortDate(it.fecha)}</div>
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

      <div className="pt-0.5 text-[12px] text-ds-text-4">
        Mapping: {MAPPING_LABEL[row.mapping] ?? row.mapping}
        {row.isArchived ? " · fila archivada" : ""}
      </div>
    </div>
  );
}
