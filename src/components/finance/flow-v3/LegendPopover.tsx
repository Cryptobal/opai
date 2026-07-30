"use client";

import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

/**
 * Muestra (swatch, título, descripción) de cada estado de celda. Debe coincidir
 * EXACTAMENTE con lo que renderiza PlanillaCell (grid-classes.ts). Regla: fondo
 * relleno = documento existe; sin fondo + borde izquierdo punteado = proyección.
 */
const ITEMS: Array<{ swatch: string; title: string; desc: string }> = [
  {
    swatch:
      "bg-status-ok-soft border border-status-ok-border relative before:absolute before:left-[3px] before:top-1/2 before:-translate-y-1/2 before:h-[4px] before:w-[4px] before:rounded-full before:bg-primary before:content-['']",
    title: "Real (conciliado)",
    desc: "Movimiento bancario conciliado — la plata ya entró o salió. Punto azul.",
  },
  {
    swatch: "bg-status-info-soft border border-status-info-border",
    title: "Factura emitida",
    desc: "DTE con folio, aún por cobrar. Chip con el folio (ej. F°1234).",
  },
  {
    swatch:
      "border-y border-r border-ds-border-subtle border-l-2 border-l-status-info-border [border-left-style:dotted]",
    title: "Programada",
    desc: "Cuota proyectada de una programación, todavía sin documento. Chip «P».",
  },
  {
    swatch: "bg-status-warn-soft border border-status-warn-border",
    title: "Proforma / EP enviado",
    desc: "Borrador ya enviado al cliente, pendiente de emitir. Chip «EP».",
  },
  {
    swatch:
      "border-y border-r border-ds-border-subtle border-l-2 border-l-status-warn-border [border-left-style:dotted]",
    title: "Borrador",
    desc: "Borrador de factura sin enviar. Chip «B».",
  },
  {
    swatch: "border border-ds-border-default",
    title: "Plan",
    desc: "Monto que escribiste tú a mano en una semana abierta.",
  },
];

export function LegendPopover({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Qué significan los colores</DialogTitle>
        </DialogHeader>
        <ul className="space-y-2.5">
          {ITEMS.map((it) => (
            <li key={it.title} className="flex items-start gap-2.5">
              <span className={`mt-0.5 h-4 w-6 shrink-0 rounded-sm ${it.swatch}`} aria-hidden />
              <div className="min-w-0">
                <p className="text-ds-body font-medium text-ds-text-1">{it.title}</p>
                <p className="text-[12px] leading-snug text-ds-text-3">{it.desc}</p>
              </div>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
