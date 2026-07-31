"use client";

import { MoreHorizontal } from "lucide-react";

type Props = {
  /** Mensajes agrupados detrás de la píldora. */
  hiddenCount: number;
  /** true = la cadena está desplegada (la píldora ofrece volver a agrupar). */
  ungrouped: boolean;
  onToggle: () => void;
};

/**
 * Píldora contadora entre el primer mensaje y el tramo reciente (estilo Gmail).
 * Desplegada, el mismo control vuelve a agrupar el historial.
 */
export function CorreoThreadFoldSeparator({ hiddenCount, ungrouped, onToggle }: Props) {
  const label = ungrouped
    ? "Agrupar historial"
    : `${hiddenCount} mensaje${hiddenCount === 1 ? "" : "s"} más`;

  return (
    <div className="relative flex items-center justify-center px-3 py-2">
      <span
        aria-hidden
        className="absolute inset-x-3 top-1/2 h-px -translate-y-1/2 bg-ds-border-subtle"
      />
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={ungrouped}
        title={ungrouped ? "Agrupar historial" : "Mostrar los mensajes ocultos"}
        className="relative inline-flex h-11 items-center gap-1.5 rounded-full border border-ds-border-subtle bg-ds-surface-2 px-3 text-[12px] font-medium text-ds-text-2 ds-tap hover:bg-ds-surface-3 hover:text-ds-text-1 sm:h-[34px]"
      >
        {!ungrouped && <MoreHorizontal className="h-3.5 w-3.5" aria-hidden />}
        <span className="tabular-nums">{label}</span>
      </button>
    </div>
  );
}
