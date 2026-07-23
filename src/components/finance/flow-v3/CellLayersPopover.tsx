"use client";

import type { CommittedItem } from "@/modules/finance/flow-v3/types";
import type { FlowMatrixCellDto, FlowMatrixRowDto } from "@/modules/finance/flow-v3/matrix-types";
import { fmtClp, fmtShortDate } from "./format";

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

const LAYER_LABEL = { real: "Real", committed: "Comprometido", plan: "Plan", empty: "Sin dato" } as const;

/** Tipo + tono del item comprometido, alineado con el color de la celda (§5F):
 *  factura/programada = azul (info); borrador/proforma = ámbar (warn). */
function committedItemMeta(it: CommittedItem): { label: string; tone: string } {
  if (it.kind === "dte") return { label: `F°${it.folio ?? "?"}`, tone: "text-status-info-fg" };
  if (it.kind === "draft") {
    return it.proformaSent
      ? { label: "EP enviado", tone: "text-status-warn-fg" }
      : { label: "Borrador", tone: "text-status-warn-fg" };
  }
  return { label: "Programada", tone: "text-status-info-fg" };
}

/**
 * Visor de SOLO LECTURA de las capas de una celda (§5B). Las acciones de
 * programación (aplazar término, días de cobro) migraron al menú de fila
 * (RowContextMenu); aquí no hay ningún control de mutación. Encabezado con la
 * capa efectiva, tres bloques (Plan / Comprometido / Real) y el mapping de la
 * fila al pie. Cierra con Esc o click fuera.
 */
export function CellLayersPopover({ state, onClose }: Props) {
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
        <span className="font-mono text-[11px] uppercase tracking-wide text-ds-text-3">{title}</span>
        {active && (
          <span className="font-mono text-[11px] uppercase tracking-wide text-primary">efectiva</span>
        )}
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
        className="fixed z-50 w-[320px] space-y-1.5 rounded-lg border border-ds-border-default bg-ds-surface-3 p-2 text-xs shadow-lg"
        style={{ left, top }}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate font-medium text-ds-text-1">{row.name}</span>
          <span className="shrink-0 font-mono text-[11px] uppercase tracking-wide text-ds-text-3">
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
                        <span className={`shrink-0 font-mono text-[11px] uppercase tracking-tight ${meta.tone}`}>
                          {meta.label}
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

        <div className="pt-0.5 font-mono text-[11px] uppercase tracking-wide text-ds-text-4">
          Mapping: {MAPPING_LABEL[row.mapping] ?? row.mapping}
          {row.isArchived ? " · fila archivada" : ""}
        </div>
      </div>
    </>
  );
}
