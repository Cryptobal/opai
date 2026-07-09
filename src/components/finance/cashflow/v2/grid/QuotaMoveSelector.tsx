"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CellStatusPill } from "@/components/finance/cashflow/CellStatusPill";
import { fmt } from "@/components/finance/cashflow/MatrixHelpers";
import type { VirtualOccurrence } from "@/modules/finance/cashflow/types";
import { occurrenceVariant } from "./cell-occurrences";

interface Props {
  open: boolean;
  /** Etiqueta de la semana destino (ej. "6 ene"). */
  toLabel: string;
  /** Cuotas movibles de la celda de origen. */
  occurrences: VirtualOccurrence[];
  onSelect: (o: VirtualOccurrence) => void;
  onCancel: () => void;
}

/**
 * Selector "¿Cuál cuota mover?" — se abre al soltar un arrastre desde una celda
 * con más de una cuota movible. Lista cada cuota (pill de estado, monto y folio
 * si tiene DTE) como ítem tappable; al elegir una se llama al move unificado
 * con esa cuota. Reutiliza el Dialog del DS (Esc / clic fuera cierran, foco
 * inicial en el primer ítem, navegable por teclado).
 */
export function QuotaMoveSelector({
  open,
  toLabel,
  occurrences,
  onSelect,
  onCancel,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>¿Cuál cuota mover a {toLabel}?</DialogTitle>
          <DialogDescription className="leading-relaxed">
            Esta celda tiene varias cuotas. Elige cuál mover a la semana destino.
          </DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-1.5">
          {occurrences.map((o, i) => (
            <li key={o.id ?? `${o.dteId ?? "occ"}-${i}`}>
              <button
                type="button"
                autoFocus={i === 0}
                onClick={() => onSelect(o)}
                className="flex min-h-[44px] w-full items-center gap-3 rounded-ds-md border border-ds-border-default px-3 py-2 text-left transition-colors hover:bg-ds-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <CellStatusPill variant={occurrenceVariant(o)} className="shrink-0" />
                <span className="ml-auto font-mono text-[13px] font-medium tabular-nums text-ds-text-1">
                  {fmt.format(o.amountClp)}
                </span>
                {o.dteFolio != null && (
                  <span className="shrink-0 font-mono text-[12px] tabular-nums text-ds-text-3">
                    N° {o.dteFolio}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
