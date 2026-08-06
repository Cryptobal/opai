"use client";

import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { CORNER_LEGEND_ITEMS } from "./cell-color-meaning";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Si true, describe chips de texto; si false, marcas de esquina. */
  showChips?: boolean;
}

const CHIP_ITEMS: Array<{ swatch: string; title: string; desc: string }> = [
  {
    swatch:
      "bg-status-ok-soft border border-status-ok-border",
    title: "Real (conciliado)",
    desc: "Fondo teal — movimiento bancario conciliado.",
  },
  {
    swatch: "bg-status-info-soft border border-status-info-border",
    title: "Factura emitida",
    desc: "Chip con el folio (ej. F°1234). Si está cedida, marca verde abajo a la derecha.",
  },
  {
    swatch:
      "border-y border-r border-ds-border-subtle border-l-2 border-l-status-info-border [border-left-style:dotted]",
    title: "Programada",
    desc: "Chip «P» — cuota sin documento.",
  },
  {
    swatch: "bg-status-warn-soft border border-status-warn-border",
    title: "EP / Proforma enviados",
    desc: "Chip «EP» o «Proforma» — documento de cobro enviado (también marca abajo a la derecha).",
  },
  {
    swatch:
      "border-y border-r border-ds-border-subtle border-l-2 border-l-status-warn-border [border-left-style:dotted]",
    title: "Borrador",
    desc: "Chip «B» — borrador sin enviar.",
  },
  {
    swatch: "border border-primary/40 bg-ds-surface-1",
    title: "Plan manual",
    desc: "Monto que escribiste tú a mano (pisa proyecciones).",
  },
];

export function LegendPopover({ open, onOpenChange, showChips }: Props) {
  const items = showChips ? CHIP_ITEMS : CORNER_LEGEND_ITEMS;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Qué significan los colores</DialogTitle>
        </DialogHeader>
        <p className="text-[12px] text-ds-text-3">
          {showChips
            ? "Modo chips: fondo tintado + etiqueta de texto. Marcas abajo a la derecha: cedida / EP / proforma."
            : "Modo marcas: triángulo arriba a la derecha = estado principal; abajo a la derecha = cedida / EP / proforma."}
        </p>
        <ul className="space-y-2.5">
          {items.map((it) => (
            <li key={it.title} className="flex items-start gap-2.5">
              <span className={`mt-0.5 h-4 w-6 shrink-0 rounded-sm ${it.swatch}`} aria-hidden />
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-ds-text-1">{it.title}</p>
                <p className="text-[12px] leading-snug text-ds-text-3">{it.desc}</p>
              </div>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
