import { cn } from "@/lib/utils";

/**
 * Layout compartido CPQ/Leads: columna de etiquetas (con wrap, sin truncar) y columna de montos alineada.
 * max-w-xl evita separar texto y números en los extremos del viewport en pantallas anchas.
 */
/** ~42rem: bloque compacto en pantallas anchas sin estirar etiqueta y monto a los extremos */
export const CPQ_BREAKDOWN_SHELL = "w-full max-w-2xl";

/** Fila etiqueta | monto */
export const CPQ_BREAKDOWN_ROW =
  "grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 items-start";

/** Celda de monto: derecha, sin cortar números en varias líneas salvo overflow extremo */
export function cpqBreakdownAmount(className?: string) {
  return cn(
    "font-mono text-right tabular-nums whitespace-nowrap shrink-0 self-start pt-px",
    className,
  );
}
