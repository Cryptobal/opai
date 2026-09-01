/**
 * Cálculo compartido de montos para DTEs (issuer + draft + recurring + preview).
 *
 * REGLA DE ORO de la aritmética CLP/UF chilena para SII:
 *
 *   1. Los montos enviados al SII son SIEMPRE enteros en CLP. Sin centavos,
 *      sin decimales. Si llegamos con $999.998,32 al SII lo redondea a
 *      $999.998 — y ahí nace el bug del "millón que quedó en 999.998".
 *
 *   2. Cuando la factura es en UF, el monto contractual se normaliza
 *      SIEMPRE a 2 decimales (`roundUfTo2`) y el neto CLP se obtiene con
 *      `ufToClpNet` (round al peso). El redondeo vive en el CLP, no en el
 *      T/C. Antes se multiplicaba el UF crudo (hasta 4 decimales) o se
 *      redondeaba a centavos (`* 100 / 100`), que arrastraba drift.
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
import { roundUfTo2, ufToClpNet } from "@/lib/uf-utils";
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
   *
   * También se usa en borradores CLP nacidos de programaciones UF: no
   * reconvierte precios (ya están en pesos) pero persiste `ufValue`
   * para auditoría en la UI.
   */
  ufOverride?: number;
  /**
   * Fecha de la UF aplicada (política de fijación de la programación).
   * Si no viene, en currency=UF se usa "hoy"; en CLP+override queda null.
   */
  ufDateOverride?: Date | null;
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
    ufDate = opts.ufDateOverride ?? new Date();
    for (const l of input.lines) {
      if (typeof l.unitPriceUf !== "number" || l.unitPriceUf <= 0) {
        throw new Error("En facturación UF cada línea requiere unitPriceUf > 0");
      }
    }
  } else if (opts.ufOverride && opts.ufOverride > 0) {
    // Draft CLP con líneas convertidas desde UF (programación). Los
    // unitPrice ya están en pesos: solo congelamos la UF usada.
    ufValue = opts.ufOverride;
    ufDate = opts.ufDateOverride ?? null;
  }

  let totalNet = 0;
  let totalExempt = 0;
  const lines: ComputedDteAmountsLine[] = [];

  for (const line of input.lines) {
    // Conversión UF → CLP entero. Primero 2 decimales de UF, después
    // round al peso. Evita el drift de 4 decimales y el viejo
    // `round(uf * tc * 100) / 100` que arrastraba centavos.
    const unitPriceUf =
      input.currency === "UF" && line.unitPriceUf
        ? roundUfTo2(line.unitPriceUf)
        : line.unitPriceUf;
    const unitPriceClp =
      input.currency === "UF" && unitPriceUf
        ? ufToClpNet(unitPriceUf, ufValue ?? 0)
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

    lines.push({
      ...line,
      unitPrice: unitPriceClp,
      unitPriceUf,
      netAmount: net,
    });
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
