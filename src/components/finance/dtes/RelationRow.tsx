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
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 text-[11px] text-ds-text-3 pl-2 border-l-2",
        tone,
        compact ? "pt-0.5" : "pt-1",
      )}
    >
      <ArrowUpRight className="h-3 w-3 shrink-0" />
      <span className="font-medium">{codeLabel}</span>
      <span>·</span>
      <span>{typeLabel} #</span>
      <span className="font-mono">{referenceFolio}</span>
    </div>
  );
}
