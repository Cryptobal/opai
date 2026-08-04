"use client";

import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Si true, describe chips de texto; si false, marcas de esquina. */
  showChips?: boolean;
}

const CORNER_ITEMS: Array<{ swatch: string; title: string; desc: string }> = [
  {
    swatch:
      "relative bg-ds-surface-1 border border-ds-border-default after:absolute after:right-0 after:top-0 after:h-0 after:w-0 after:border-l-[6px] after:border-t-[6px] after:border-l-transparent after:border-t-status-ok after:content-['']",
    title: "Real (conciliado)",
    desc: "Marca de esquina verde — la plata ya entró o salió.",
  },
  {
    swatch:
      "relative bg-ds-surface-1 border border-ds-border-default after:absolute after:right-0 after:top-0 after:h-0 after:w-0 after:border-l-[6px] after:border-t-[6px] after:border-l-transparent after:border-t-status-info after:content-['']",
    title: "Factura emitida",
    desc: "Marca azul — DTE con folio (ej. F°1234). Folio en el tooltip.",
  },
  {
    swatch:
      "relative bg-ds-surface-1 border border-ds-border-default after:absolute after:right-0 after:top-0 after:h-0 after:w-0 after:border-l-[6px] after:border-t-[6px] after:border-l-transparent after:border-t-status-warn after:content-['']",
    title: "EP / Proforma / Borrador",
    desc: "Marca ámbar — EP, Proforma o borrador sin enviar.",
  },
  {
    swatch: "bg-ds-surface-1 border border-ds-border-default",
    title: "Programada",
    desc: "Sin marca — cuota proyectada; monto en tono atenuado.",
  },
  {
    swatch:
      "relative bg-ds-surface-1 border border-ds-border-default after:absolute after:right-0 after:top-0 after:h-0 after:w-0 after:border-l-[6px] after:border-t-[6px] after:border-l-transparent after:border-t-primary after:content-['']",
    title: "Plan manual",
    desc: "Marca teal — monto editado a mano; pisa la proyección (salvo factura emitida).",
  },
];

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
    desc: "Chip con el folio (ej. F°1234).",
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
    desc: "Chip «EP» o «Proforma» — documento de cobro enviado.",
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
  const items = showChips ? CHIP_ITEMS : CORNER_ITEMS;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Qué significan los colores</DialogTitle>
        </DialogHeader>
        <p className="text-[12px] text-ds-text-3">
          {showChips
            ? "Modo chips: fondo tintado + etiqueta de texto."
            : "Modo marcas: triángulo de esquina por estado (toggle Chips para etiquetas)."}
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
