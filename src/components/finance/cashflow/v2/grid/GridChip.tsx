"use client";

import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmt } from "@/components/finance/cashflow/MatrixHelpers";
import type { PillVariant } from "@/components/finance/cashflow/CellStatusPill";

/** Clases del chip por etapa del DTE. Consistente con CellStatusPill pero en
 *  formato compacto (monto en vez de etiqueta). Todo con tokens DS. */
const CHIP: Record<PillVariant, string> = {
  PROJECTED: "bg-ds-surface-3 text-ds-text-2 border border-ds-border-subtle",
  DRAFT: "bg-status-warn-soft text-status-warn-fg",
  INVOICED: "bg-status-info-soft text-status-info-fg",
  FACTORING: "bg-tint-violet-soft text-tint-violet-fg",
  FACTORING_COLLECTED: "bg-tint-teal text-ds-text-1",
  PAID: "bg-status-ok-soft text-status-ok-fg",
  OVERDUE: "bg-status-danger-soft text-status-danger-fg",
  VOIDED: "bg-tint-rose text-status-danger-fg line-through",
};

/**
 * Chip de cuota: monto (mono, tabular) con color según la etapa del DTE.
 * Pagada = candado (fija). El arrastre real se cablea en B4 (este componente
 * solo pinta; el wrapper draggable lo agrega el padre).
 */
export function GridChip({
  amount,
  variant,
  locked = false,
  draggable = false,
  elevated = false,
  title,
}: {
  amount: number;
  variant: PillVariant;
  /** Pagada/conciliada: muestra candado y no se arrastra. */
  locked?: boolean;
  /** Afecta solo el cursor/affordance; el DnD se maneja en el padre (B4). */
  draggable?: boolean;
  /** En el DragOverlay: eleva el chip (sombra + leve escala + anillo) para que
   *  se lea "agarrado y flotando" mientras sigue al dedo. */
  elevated?: boolean;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex min-h-[30px] items-center justify-center gap-1 rounded-ds-sm px-1.5 py-1 font-mono text-[12px] font-medium tabular-nums",
        CHIP[variant],
        draggable && "cursor-grab active:cursor-grabbing",
        elevated && "scale-105 shadow-lg ring-2 ring-inset ring-primary/50",
      )}
    >
      {locked && <Lock className="h-3 w-3 shrink-0 opacity-70" aria-hidden />}
      {fmt.format(amount)}
    </span>
  );
}
