/**
 * Cálculo compartido de montos para DTEs (issuer + draft + recurring + preview).
 *
 * REGLA DE ORO de la aritmética CLP/UF chilena para SII:
 *
 *   1. Los montos enviados al SII son SIEMPRE enteros en CLP. Sin centavos,
 *      sin decimales. Si llegamos con $999.998,32 al SII lo redondea a
 *      $999.998 — y ahí nace el bug del "millón que quedó en 999.998".
 *
 *   2. Cuando la factura es en UF, el `unitPriceUf` puede tener hasta 4
 *      decimales (estándar SII), pero el `unitPriceClp` resultante de la
 *      conversión es SIEMPRE entero (sin decimales ni centavos). Antes
 *      redondeábamos a 2 decimales (`* 100 / 100`), que arrastraba el
 *      drift hacia gross y rompía el total redondo.
 *
 *   3. La fórmula del IVA usa el `IVA_RATE = 19` (entero %, no `0.19`).
 *      `taxAmount = round((totalNet * 19) / 100)` da el mismo resultado
 *      que `round(totalNet * 0.19)` SOLO si totalNet es entero — por eso
 *      la regla #1 es no negociable.
 *
 * Esta función es la ÚNICA fuente de verdad. Tanto el preview del cliente
 * (vía /api/finance/billing/preview-amounts) como el issuer real
 * (dte-issuer.service.ts) la consumen — garantiza que el monto visto en
 * el form = monto emitido al SII.
 */
import { IVA_RATE } from "../shared/constants/dte-types";
import type { IssueDteInput } from "./dte-issuer.service";

type AmountsInput = Pick<IssueDteInput, "currency" | "lines" | "dteType">;

export type ComputedDteAmountsLine = IssueDteInput["lines"][0] & {
  /** Precio unitario CLP redondeado a entero (sin centavos). */
  unitPrice: number;
  /** Subtotal de la línea: round(qty * unitPrice * (1 - discount/100)). */
  netAmount: number;
};

export type ComputedDteAmounts = {
  totalNet: number;
  totalExempt: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  ufValue: number | null;
  ufDate: Date | null;
  lines: ComputedDteAmountsLine[];
};

/**
 * Calcula la UF para un input UF dado. Importa lazy para no agregar
 * dependencia de FX en el bundle del cliente cuando se hace preview con
 * UF override.
 */
async function resolveUfValue(opts?: {
  ufOverride?: number;
}): Promise<number> {
  if (opts?.ufOverride && opts.ufOverride > 0) return opts.ufOverride;
  const { getUfValue } = await import("@/lib/uf");
  const v = await getUfValue();
  if (!v || v <= 0) {
    throw new Error(
      "No se pudo obtener valor UF del día. Verifica el cron de FX.",
    );
  }
  return v;
}

export interface ComputeDteAmountsOptions {
  /**
   * UF override: si se pasa, no llama a getUfValue() (útil en preview
   * client-side para reproducir el monto que tendrá el borrador). En
   * la emisión real (issuer) NO se debe pasar — siempre UF del día.
   */
  ufOverride?: number;
  /**
   * Si true, en CLP rechazamos `unitPrice` con decimales. En UF también
   * validamos que el `unitPriceClp` resultante sea entero.
   *
   * Default: true. Solo lo dejamos opcional para no romper tests legacy.
   */
  strict?: boolean;
}

export async function computeDteAmounts(
  input: AmountsInput,
  opts: ComputeDteAmountsOptions = {},
): Promise<ComputedDteAmounts> {
  const strict = opts.strict ?? true;
  let ufValue: number | null = null;
  let ufDate: Date | null = null;

  if (input.currency === "UF") {
    ufValue = await resolveUfValue(opts);
    ufDate = new Date();
    for (const l of input.lines) {
      if (typeof l.unitPriceUf !== "number" || l.unitPriceUf <= 0) {
        throw new Error("En facturación UF cada línea requiere unitPriceUf > 0");
      }
    }
  }

  let totalNet = 0;
  let totalExempt = 0;
  const lines: ComputedDteAmountsLine[] = [];

  for (const line of input.lines) {
    // Conversión UF → CLP entero. Redondeamos al peso, no a centavos.
    // Esto es lo que arregla el bug "1.000.000 quedó en 999.998": antes
    // hacíamos `round(unitPriceUf * uf * 100) / 100` que dejaba drift de
    // centavos arrastrándose por el resto del cálculo.
    const unitPriceClp =
      input.currency === "UF" && line.unitPriceUf
        ? Math.round(line.unitPriceUf * (ufValue ?? 0))
        : line.unitPrice;

    if (strict && input.currency !== "UF") {
      // CLP estricto: el unitPrice ingresado debe ser entero. Decimales
      // en CLP NO existen para el SII y solo introducen drift.
      if (!Number.isFinite(unitPriceClp)) {
        throw new Error(
          `Línea "${line.itemName}": unitPrice inválido (${line.unitPrice}).`,
        );
      }
      if (!Number.isInteger(unitPriceClp)) {
        throw new Error(
          `Línea "${line.itemName}": unitPrice CLP debe ser entero (recibido ${line.unitPrice}). Los DTEs SII no admiten centavos en CLP.`,
        );
      }
    }

    const gross = line.quantity * unitPriceClp;
    const discount = (gross * (line.discountPct ?? 0)) / 100;
    const net = Math.round(gross - discount);

    if (line.isExempt) totalExempt += net;
    else totalNet += net;

    lines.push({ ...line, unitPrice: unitPriceClp, netAmount: net });
  }

  const isExempt = input.dteType === 34;
  const taxRate = isExempt ? 0 : IVA_RATE;
  const taxAmount = isExempt ? 0 : Math.round((totalNet * taxRate) / 100);
  const totalAmount = totalNet + totalExempt + taxAmount;

  return {
    totalNet,
    totalExempt,
    taxRate,
    taxAmount,
    totalAmount,
    ufValue,
    ufDate,
    lines,
  };
}
