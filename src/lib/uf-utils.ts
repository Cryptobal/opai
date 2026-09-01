/**
 * Utilidades puras de conversión UF/CLP.
 * No importar código server-side aquí.
 */

export function clpToUf(clp: number, ufValue: number): number {
  if (!ufValue || ufValue <= 0) return 0;
  return clp / ufValue;
}

export function ufToClp(uf: number, ufValue: number): number {
  return uf * ufValue;
}

/**
 * Normaliza un monto UF contractual a 2 decimales (half-up).
 * Estados de pago y facturación siempre trabajan con esta precisión.
 */
export function roundUfTo2(uf: number): number {
  if (!Number.isFinite(uf)) return 0;
  return Math.round(uf * 100) / 100;
}

/**
 * Convierte UF → neto CLP entero: primero 2 decimales de UF, después
 * `Math.round` al peso. El redondeo vive en el CLP, no en el T/C.
 */
export function ufToClpNet(uf: number, ufValue: number): number {
  return Math.round(roundUfTo2(uf) * (ufValue || 0));
}

/**
 * Desglose UF → CLP para mostrar en el editor de borradores.
 * Si no hay `ufValue` (borradores viejos de programación) se infiere
 * como `round(CLP / UF, 2)` a partir del precio en pesos guardado.
 */
export type UfPriceBreakdown = {
  amountUf: number;
  ufValue: number;
  clp: number;
  /** El CLP persistido no coincide con `ufToClpNet` (precio editado). */
  priceEdited: boolean;
  /** El valor UF no estaba persistido; se reconstruyó desde el CLP. */
  ufValueInferred: boolean;
};

export function resolveUfPriceBreakdown(args: {
  amountUf: number | null | undefined;
  ufValue?: number | null;
  unitPriceClp?: number | null;
}): UfPriceBreakdown | null {
  const amountUf = roundUfTo2(Number(args.amountUf ?? 0));
  if (!(amountUf > 0)) return null;

  const clpStored =
    args.unitPriceClp != null && Number.isFinite(Number(args.unitPriceClp))
      ? Math.round(Number(args.unitPriceClp))
      : null;

  let ufValue =
    args.ufValue != null && Number.isFinite(Number(args.ufValue)) && Number(args.ufValue) > 0
      ? Number(args.ufValue)
      : null;
  let inferred = false;
  if (ufValue == null && clpStored != null && clpStored > 0) {
    ufValue = Math.round((clpStored / amountUf) * 100) / 100;
    inferred = true;
  }
  if (ufValue == null || !(ufValue > 0)) return null;

  const clpCalc = ufToClpNet(amountUf, ufValue);
  const clp = clpStored != null && clpStored > 0 ? clpStored : clpCalc;
  return {
    amountUf,
    ufValue,
    clp,
    priceEdited: clpStored != null && clpStored > 0 && clpStored !== clpCalc,
    ufValueInferred: inferred,
  };
}

/** Fecha de la UF en DD/MM/YYYY (UTC, sin drift de TZ). */
export function formatUfDateDmy(
  value: Date | string | null | undefined,
): string | null {
  if (value == null || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const year = d.getUTCFullYear();
  return `${day}/${month}/${year}`;
}
