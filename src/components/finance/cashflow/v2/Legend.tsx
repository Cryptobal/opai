import { Lock, ArrowLeftRight, FileText } from "lucide-react";

/** Mini-leyenda reducida de las affordances esenciales del detalle. */
export function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ds-text-3">
      <span className="inline-flex items-center gap-1.5">
        <Lock className="h-3.5 w-3.5" /> candado = conciliado (fijo)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <ArrowLeftRight className="h-3.5 w-3.5" /> flechas = mover de semana
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="rounded-ds-sm bg-purple-500/15 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.04em] text-purple-300">
          F
        </span>{" "}
        factoring
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="rounded-ds-sm bg-ds-surface-3 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.04em] text-ds-text-2">
          UF
        </span>{" "}
        monto en UF
      </span>
      <span className="inline-flex items-center gap-1.5">
        <FileText className="h-3.5 w-3.5 text-primary" /> N° = folio de factura
      </span>
    </div>
  );
}
