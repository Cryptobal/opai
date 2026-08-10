"use client";

import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ClipboardCheck, FileText } from "lucide-react";
import {
  CHIP_LEGEND_ITEMS,
  CORNER_LEGEND_ITEMS,
  type ChipLegendItem,
  type ColorMeaningItem,
} from "./cell-color-meaning";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /**
   * true = modo color (fondo + chip); false = modo cuñas (marcas de esquina).
   * La leyenda describe el modo activo.
   */
  showChips?: boolean;
}

function showIcons(it: ColorMeaningItem | ChipLegendItem): boolean {
  return "icons" in it && it.icons === true;
}

export function LegendPopover({ open, onOpenChange, showChips }: Props) {
  const colorMode = showChips !== false;
  const items = colorMode ? CHIP_LEGEND_ITEMS : CORNER_LEGEND_ITEMS;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Qué significan los colores</DialogTitle>
        </DialogHeader>
        <p className="text-[12px] font-medium text-ds-text-2">
          {colorMode ? "Modo color (default)" : "Modo cuñas"}
        </p>
        <p className="text-[12px] text-ds-text-3">
          {colorMode
            ? "Fondo de celda = etapa fuerte (pagada / facturada / cedida). Programada y borrador quedan grises; en borrador, iconos = proforma o estado de pago enviado."
            : "Triángulo arriba a la derecha = estado principal; abajo a la derecha = cedida / EP / proforma. La celda no se pinta de fondo."}
        </p>
        <ul className="space-y-2.5">
          {items.map((it) => (
            <li key={it.key} className="flex items-start gap-2.5">
              <span className={`mt-0.5 h-4 w-6 shrink-0 rounded-sm ${it.swatch}`} aria-hidden />
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-ds-text-1">
                  {it.title}
                  {showIcons(it) ? (
                    <span className="ml-1.5 inline-flex items-center gap-0.5 align-middle text-ds-text-3">
                      <FileText className="h-3 w-3 text-status-info-fg" aria-hidden />
                      <ClipboardCheck className="h-3 w-3 text-primary" aria-hidden />
                    </span>
                  ) : null}
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
