"use client";

import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ClipboardCheck, FileText } from "lucide-react";
import { CORNER_LEGEND_ITEMS } from "./cell-color-meaning";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Si true, describe chips de texto; si false, marcas de esquina. */
  showChips?: boolean;
}

const CHIP_ITEMS: Array<{ swatch: string; title: string; desc: string; icons?: boolean }> = [
  {
    swatch: "bg-status-ok-soft border border-status-ok-border",
    title: "Pagada / Real",
    desc: "Fondo verde — la plata ya entró o salió (conciliado).",
  },
  {
    swatch: "bg-status-info-soft border border-status-info-border",
    title: "Facturada no pagada",
    desc: "Fondo azul + chip con folio (ej. F°1234).",
  },
  {
    swatch: "bg-tint-violet/60 border border-tint-violet-fg/40",
    title: "Cedida",
    desc: "Fondo violeta — factura cedida a factoring (distinto de facturada).",
  },
  {
    swatch:
      "border-y border-r border-ds-border-subtle border-l-2 border-l-status-warn-border [border-left-style:dotted]",
    title: "Borrador",
    desc: "Sin fondo (gris) + chip «B». Si enviaste proforma o EP, aparecen iconos a la derecha del monto.",
    icons: true,
  },
  {
    swatch:
      "border-y border-r border-ds-border-subtle border-l-2 border-l-status-info-border [border-left-style:dotted]",
    title: "Programada",
    desc: "Sin fondo + borde punteado — cuota proyectada, aún sin documento.",
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
            ? "Fondo de celda = etapa fuerte (pagada / facturada / cedida). Programada y borrador quedan grises; en borrador, iconos = proforma o estado de pago enviado."
            : "Modo marcas: triángulo arriba a la derecha = estado principal; abajo a la derecha = cedida / EP / proforma."}
        </p>
        <ul className="space-y-2.5">
          {items.map((it) => (
            <li key={it.title} className="flex items-start gap-2.5">
              <span className={`mt-0.5 h-4 w-6 shrink-0 rounded-sm ${it.swatch}`} aria-hidden />
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-ds-text-1">
                  {it.title}
                  {"icons" in it && it.icons && (
                    <span className="ml-1.5 inline-flex items-center gap-0.5 align-middle text-ds-text-3">
                      <FileText className="h-3 w-3 text-status-info-fg" aria-hidden />
                      <ClipboardCheck className="h-3 w-3 text-primary" aria-hidden />
                    </span>
                  )}
                </p>
                <p className="text-[12px] leading-snug text-ds-text-3">{it.desc}</p>
              </div>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
