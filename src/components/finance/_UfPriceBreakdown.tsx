"use client";

/**
 * Cuadro de auditoría UF → CLP en una línea de DTE.
 * Muestra monto UF, valor de UF tomado y el precio resultante en pesos.
 */

import type { UfPriceBreakdown } from "@/lib/uf-utils";
import { formatCLP, formatUFSuffix, formatUfRateClp } from "@/lib/utils";

export type UfPriceBreakdownView = UfPriceBreakdown & {
  /** Origen de la UF: fecha, "UF del día", "valor pactado". */
  ufSourceLabel?: string | null;
};

export function UfPriceBreakdownBox({
  amountUf,
  ufValue,
  clp,
  priceEdited,
  ufValueInferred,
  ufSourceLabel,
}: UfPriceBreakdownView) {
  const sourceText = ufValueInferred
    ? "Valor UF inferido del precio en pesos"
    : ufSourceLabel
      ? `UF tomada: ${ufSourceLabel}`
      : null;

  return (
    <div
      className="rounded-md border border-status-info-border bg-status-info-soft px-3 py-2 space-y-1"
      data-testid="uf-price-breakdown"
    >
      <p className="text-[12px] uppercase tracking-wide text-status-info-fg">
        Origen UF
      </p>
      <p className="text-[13px] font-mono tabular-nums text-ds-text-1">
        {formatUFSuffix(amountUf)} × {formatUfRateClp(ufValue)} = {formatCLP(clp)}
      </p>
      {sourceText && (
        <p className="text-[12px] text-ds-text-3">{sourceText}</p>
      )}
      {priceEdited && (
        <p className="text-[12px] text-status-warn-fg">
          El precio en pesos fue modificado respecto de este cálculo.
        </p>
      )}
    </div>
  );
}
