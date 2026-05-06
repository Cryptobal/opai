/**
 * Cálculo compartido de montos para DTEs (issuer + draft + recurring).
 *
 * Si currency=UF, convierte unitPriceUf → unitPrice CLP usando la UF del
 * día (vía FxUfRate). Persiste ambos: el unitPrice (CLP) va al provider
 * y al asiento contable; el unitPriceUf queda como auditoría.
 *
 * Si currency=CLP/USD, ignora unitPriceUf.
 */
import { IVA_RATE } from "../shared/constants/dte-types";
import type { IssueDteInput } from "./dte-issuer.service";

type AmountsInput = Pick<IssueDteInput, "currency" | "lines" | "dteType">;

export type ComputedDteAmounts = {
  totalNet: number;
  totalExempt: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  ufValue: number | null;
  ufDate: Date | null;
  lines: Array<
    IssueDteInput["lines"][0] & { netAmount: number; unitPrice: number }
  >;
};

export async function computeDteAmounts(
  input: AmountsInput,
): Promise<ComputedDteAmounts> {
  let ufValue: number | null = null;
  let ufDate: Date | null = null;

  if (input.currency === "UF") {
    const { getUfValue } = await import("@/lib/uf");
    ufValue = await getUfValue();
    ufDate = new Date();
    if (!ufValue || ufValue <= 0) {
      throw new Error("No se pudo obtener valor UF del día. Verifica el cron de FX.");
    }
    for (const l of input.lines) {
      if (typeof l.unitPriceUf !== "number" || l.unitPriceUf <= 0) {
        throw new Error("En facturación UF cada línea requiere unitPriceUf > 0");
      }
    }
  }

  let totalNet = 0;
  let totalExempt = 0;
  const lines: ComputedDteAmounts["lines"] = [];

  for (const line of input.lines) {
    const unitPriceClp =
      input.currency === "UF" && line.unitPriceUf
        ? Math.round(line.unitPriceUf * (ufValue ?? 0) * 100) / 100
        : line.unitPrice;

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

  return { totalNet, totalExempt, taxRate, taxAmount, totalAmount, ufValue, ufDate, lines };
}
