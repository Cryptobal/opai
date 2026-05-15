"use client";

import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  /** 1=Anulación total, 2=Corrige texto, 3=Corrige montos. */
  referenceCode: number | null;
  referenceFolio: number;
  /** Tipo del DTE referenciado (33|34|39|56|61|...). */
  referenceType: number;
  /** Para mobile: render compacto. */
  compact?: boolean;
}

const CODE_LABELS: Record<number, string> = {
  1: "Anula",
  2: "Corrige texto",
  3: "Corrige montos",
};
const TYPE_LABELS: Record<number, string> = {
  33: "Factura",
  34: "F. Exenta",
  39: "Boleta",
  56: "N. Débito",
  61: "N. Crédito",
};

/**
 * Indicador visual de la relación entre un NC/ND y el DTE que referencia.
 * Se renderiza inline en la celda Folio cuando `referenceFolio != null`.
 */
export function RelationRow({
  referenceCode,
  referenceFolio,
  referenceType,
  compact,
}: Props) {
  const codeLabel = referenceCode
    ? CODE_LABELS[referenceCode] ?? `Cod ${referenceCode}`
    : "Ref";
  const typeLabel = TYPE_LABELS[referenceType] ?? `Tipo ${referenceType}`;
  const tone =
    referenceCode === 1
      ? "border-status-danger-border"
      : "border-status-warn-border";

  // Tabla `table-fixed` + columna angosta: una sola fila flex desborda y tapa Receptor.
  if (compact) {
    return (
      <div
        className={cn(
          "min-w-0 max-w-full overflow-hidden pl-2 border-l-2 text-xs text-ds-text-3 leading-snug",
          tone,
          "pt-0.5",
        )}
      >
        <div className="flex items-start gap-1 min-w-0">
          <ArrowUpRight className="h-3 w-3 shrink-0 mt-px" aria-hidden />
          <span className="min-w-0 break-words">
            <span className="font-medium text-ds-text-2">{codeLabel}</span>
            <span className="text-ds-text-4"> · {typeLabel}</span>
          </span>
        </div>
        <div className="pl-5 font-mono tabular-nums text-ds-text-2">
          #{referenceFolio}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs text-ds-text-3 pl-2 border-l-2 min-w-0 max-w-full",
        tone,
        "pt-1",
      )}
    >
      <ArrowUpRight className="h-3 w-3 shrink-0" aria-hidden />
      <span className="font-medium">{codeLabel}</span>
      <span>·</span>
      <span>{typeLabel} #</span>
      <span className="font-mono tabular-nums">{referenceFolio}</span>
    </div>
  );
}
