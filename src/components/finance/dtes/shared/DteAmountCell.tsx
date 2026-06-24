/**
 * Celda de monto para los listados de DTEs Emitidos (desktop + mobile).
 *
 * Reglas de presentación (puramente visuales, no tocan datos):
 *   - Afecta (taxAmount > 0): desglosa Neto / IVA / Total (Total en negrita).
 *   - Exenta o sin IVA (taxAmount === 0): solo el Total. En exentas el valor
 *     vive en `exemptAmount` (fuera de netAmount), por eso NO se desglosa:
 *     evita pintar "Neto $0".
 *   - Nota de Crédito (61) / Débito (56) o documento anulado: el desglose va
 *     tachado (line-through), señalando que es un ajuste, no ingreso nuevo.
 */

import { cn } from "@/lib/utils";
import { fmtCLP } from "./constants";

/** Notas (crédito 61 / débito 56): sus montos se muestran tachados. */
const NOTE_TYPES = new Set([56, 61]);

export function DteAmountCell({
  netAmount,
  taxAmount,
  totalAmount,
  dteType,
  annulled = false,
  align = "right",
  format = fmtCLP.format,
  className,
}: {
  netAmount: number;
  taxAmount: number;
  totalAmount: number;
  dteType: number;
  /** DTE anulado por NC de anulación total (la factura original sale tachada). */
  annulled?: boolean;
  align?: "left" | "right";
  /** Formateador de moneda (mobile usa fmtCLPSmart para compactar). */
  format?: (n: number) => string;
  className?: string;
}) {
  const struck = annulled || NOTE_TYPES.has(dteType);
  const isAfecta = taxAmount > 0;
  const justify = align === "right" ? "justify-end" : "justify-start";
  const textAlign = align === "right" ? "text-right" : "text-left";

  if (!isAfecta) {
    return (
      <span
        className={cn(
          "inline-block max-w-full whitespace-nowrap font-medium font-mono tabular-nums",
          textAlign,
          struck && "text-ds-text-3 line-through",
          className,
        )}
        title={format(totalAmount)}
      >
        {format(totalAmount)}
      </span>
    );
  }

  return (
    <div
      className={cn(
        "font-mono tabular-nums leading-tight",
        textAlign,
        struck && "text-ds-text-3 line-through",
        className,
      )}
      title={`Neto ${format(netAmount)} · IVA ${format(taxAmount)} · Total ${format(totalAmount)}`}
    >
      <div className={cn("flex items-baseline gap-1.5 whitespace-nowrap text-[11px] text-ds-text-3", justify)}>
        <span>Neto</span>
        <span>{format(netAmount)}</span>
      </div>
      <div className={cn("flex items-baseline gap-1.5 whitespace-nowrap text-[11px] text-ds-text-3", justify)}>
        <span>IVA</span>
        <span>{format(taxAmount)}</span>
      </div>
      <div
        className={cn(
          "flex items-baseline gap-1.5 whitespace-nowrap text-sm font-semibold",
          !struck && "text-ds-text-1",
          justify,
        )}
      >
        <span className="text-[11px] font-normal text-ds-text-3">Total</span>
        <span>{format(totalAmount)}</span>
      </div>
    </div>
  );
}
