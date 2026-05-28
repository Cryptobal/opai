import { Lock, MoveHorizontal, FileText } from "lucide-react";

/** Mini-leyenda de las affordances del detalle. */
export function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ds-text-3">
      <span className="inline-flex items-center gap-1.5">
        <Lock className="h-3.5 w-3.5" /> candado = fijo (conciliado)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <MoveHorizontal className="h-3.5 w-3.5" /> flechas = movible
      </span>
      <span className="inline-flex items-center gap-1.5">
        <FileText className="h-3.5 w-3.5 text-primary" /> N° = folio de factura
      </span>
    </div>
  );
}
