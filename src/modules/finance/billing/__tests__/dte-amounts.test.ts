/**
 * Tests del helper de cálculo de montos. Cubre el bug del "millón que
 * quedó en 999.998" y todos los flujos CLP/UF + descuentos + exentos.
 *
 * No mockea getUfValue: para tests UF se usa siempre `ufOverride`
 * (la opción está pensada precisamente para esto).
 */

import { describe, it, expect } from "vitest";
import { computeDteAmounts } from "../dte-amounts.helper";

const baseLine = {
  itemName: "Servicio de seguridad",
  quantity: 1,
  unitPrice: 0,
  isExempt: false,
} as const;

describe("computeDteAmounts — CLP estricto (sin centavos)", () => {
  it("1.000.000 CLP → exactamente 1.190.000 (sin drift de $2)", async () => {
    const r = await computeDteAmounts({
      currency: "CLP",
      dteType: 33,
      lines: [{ ...baseLine, unitPrice: 1_000_000 }],
    });
    expect(r.totalNet).toBe(1_000_000);
    expect(r.taxAmount).toBe(190_000);
    expect(r.totalAmount).toBe(1_190_000);
    expect(r.lines[0].unitPrice).toBe(1_000_000);
    expect(r.lines[0].netAmount).toBe(1_000_000);
  });

  it("rechaza unitPrice CLP con decimales (modo strict default)", async () => {
    await expect(
      computeDteAmounts({
        currency: "CLP",
        dteType: 33,
        lines: [{ ...baseLine, unitPrice: 999_998.32 }],
      }),
    ).rejects.toThrow(/CLP debe ser entero/i);
  });

  it("permite unitPrice con decimales en modo no-strict (compat)", async () => {
    const r = await computeDteAmounts(
      {
        currency: "CLP",
        dteType: 33,
        lines: [{ ...baseLine, unitPrice: 999_998.32 }],
      },
      { strict: false },
    );
    // En modo no-strict el redondeo del net hace que termine en 999.998.
    expect(r.totalNet).toBe(999_998);
    expect(r.taxAmount).toBe(190_000);
    expect(r.totalAmount).toBe(1_189_998);
  });

  it("Factura Exenta (34) no calcula IVA aunque sea afecta", async () => {
    const r = await computeDteAmounts({
      currency: "CLP",
      dteType: 34,
      lines: [{ ...baseLine, unitPrice: 1_000_000 }],
    });
    expect(r.totalNet).toBe(1_000_000);
    expect(r.taxAmount).toBe(0);
    expect(r.taxRate).toBe(0);
    expect(r.totalAmount).toBe(1_000_000);
  });

  it("Línea exenta dentro de Factura Afecta (33) suma a totalExempt y NO a totalNet", async () => {
    const r = await computeDteAmounts({
      currency: "CLP",
      dteType: 33,
      lines: [
        { ...baseLine, itemName: "Afecta", unitPrice: 1_000_000 },
        { ...baseLine, itemName: "Exenta", unitPrice: 500_000, isExempt: true },
      ],
    });
    expect(r.totalNet).toBe(1_000_000);
    expect(r.totalExempt).toBe(500_000);
    expect(r.taxAmount).toBe(190_000);
    expect(r.totalAmount).toBe(1_690_000);
  });

  it("Cantidad fraccionaria + unitPrice entero → net redondeado al peso", async () => {
    // 2.5 horas * $40.000 = $100.000 → IVA $19.000 → total $119.000.
    const r = await computeDteAmounts({
      currency: "CLP",
      dteType: 33,
      lines: [{ ...baseLine, quantity: 2.5, unitPrice: 40_000 }],
    });
    expect(r.totalNet).toBe(100_000);
    expect(r.taxAmount).toBe(19_000);
    expect(r.totalAmount).toBe(119_000);
  });

  it("Descuento 10% sobre 1.000.000 → net 900.000, IVA 171.000, total 1.071.000", async () => {
    const r = await computeDteAmounts({
      currency: "CLP",
      dteType: 33,
      lines: [{ ...baseLine, unitPrice: 1_000_000, discountPct: 10 }],
    });
    expect(r.totalNet).toBe(900_000);
    expect(r.taxAmount).toBe(171_000);
    expect(r.totalAmount).toBe(1_071_000);
  });

  it("Múltiples líneas suman correctamente (2 facturas separadas)", async () => {
    const r = await computeDteAmounts({
      currency: "CLP",
      dteType: 33,
      lines: [
        { ...baseLine, itemName: "Servicio A", unitPrice: 500_000 },
        { ...baseLine, itemName: "Servicio B", unitPrice: 500_000 },
      ],
    });
    expect(r.totalNet).toBe(1_000_000);
    expect(r.taxAmount).toBe(190_000);
    expect(r.totalAmount).toBe(1_190_000);
    expect(r.lines).toHaveLength(2);
  });

  it("unitPrice 0 → net 0, IVA 0, total 0 (línea regalo)", async () => {
    const r = await computeDteAmounts({
      currency: "CLP",
      dteType: 33,
      lines: [{ ...baseLine, unitPrice: 0 }],
    });
    expect(r.totalNet).toBe(0);
    expect(r.taxAmount).toBe(0);
    expect(r.totalAmount).toBe(0);
  });
});

describe("computeDteAmounts — UF con ufOverride (sin red call)", () => {
  it("1 UF a UF=$38.000 → unitPrice CLP entero $38.000 + IVA $7.220 = $45.220", async () => {
    const r = await computeDteAmounts(
      {
        currency: "UF",
        dteType: 33,
        lines: [{ ...baseLine, unitPrice: 0, unitPriceUf: 1 }],
      },
      { ufOverride: 38_000 },
    );
    expect(r.lines[0].unitPrice).toBe(38_000); // entero, NO 38000.00
    expect(r.totalNet).toBe(38_000);
    expect(r.taxAmount).toBe(7_220);
    expect(r.totalAmount).toBe(45_220);
    expect(r.ufValue).toBe(38_000);
  });

  it("UF=$38.000 con UF de 4 decimales (26.3158) → unitPrice CLP entero al peso", async () => {
    // 26.3158 * 38000 = 1.000.000,4 → round = 1.000.000 (entero, sin
    // arrastrar centavos). El bug viejo redondeaba a 2 decimales primero
    // (`* 100 / 100`), que multiplicado por qty fraccionario podía
    // devolver decimales raros y romper el net redondo.
    const r = await computeDteAmounts(
      {
        currency: "UF",
        dteType: 33,
        lines: [{ ...baseLine, unitPrice: 0, unitPriceUf: 26.3158 }],
      },
      { ufOverride: 38_000 },
    );
    expect(r.lines[0].unitPrice).toBe(1_000_000);
    expect(r.totalNet).toBe(1_000_000);
    expect(r.taxAmount).toBe(190_000);
    expect(r.totalAmount).toBe(1_190_000);
  });

  it("UF con valor 'feo' que daría drift (37.999) → resultado entero, no centavos", async () => {
    // Caso reproducible del bug del usuario: UF del día = $37.999, factura
    // de 1 UF nominal. Antes el `* 100 / 100` dejaba unitPriceClp =
    // 37999.00, todo OK. Pero si el unitPriceUf era 26.3158:
    //   26.3158 * 37999 = 999.972,17 → round con 2dec = 999972,17
    //   * qty=1 → 999972,17 → round net = 999972 → IVA 189995 → 1.189.967
    // Con la nueva regla (entero al peso PRIMERO):
    //   round(26.3158 * 37999) = round(999972.17) = 999972 → entero
    //   IVA = round(999972 * 19 / 100) = round(189994.68) = 189995
    //   Total = 1.189.967 (sin drift de centavos arrastrados).
    const r = await computeDteAmounts(
      {
        currency: "UF",
        dteType: 33,
        lines: [{ ...baseLine, unitPrice: 0, unitPriceUf: 26.3158 }],
      },
      { ufOverride: 37_999 },
    );
    // round(26.3158 * 37999) = 999.974 (no es 999.972 como salía a mano —
    // JS hace 26.3158 * 37999 = 999974.20420 con float).
    expect(r.lines[0].unitPrice).toBe(999_974);
    expect(Number.isInteger(r.lines[0].unitPrice)).toBe(true);
    expect(r.totalNet).toBe(999_974);
    // round(999974 * 19 / 100) = round(189995.06) = 189.995
    expect(r.taxAmount).toBe(189_995);
    expect(r.totalAmount).toBe(1_189_969);
  });

  it("UF rechaza línea sin unitPriceUf válido", async () => {
    await expect(
      computeDteAmounts(
        {
          currency: "UF",
          dteType: 33,
          lines: [{ ...baseLine, unitPrice: 0, unitPriceUf: 0 }],
        },
        { ufOverride: 38_000 },
      ),
    ).rejects.toThrow(/unitPriceUf > 0/);
  });

  it("UF con cantidad fraccionaria: 0.5 UF * UF=$36.500 → $18.250", async () => {
    const r = await computeDteAmounts(
      {
        currency: "UF",
        dteType: 33,
        lines: [
          { ...baseLine, quantity: 0.5, unitPrice: 0, unitPriceUf: 1 },
        ],
      },
      { ufOverride: 36_500 },
    );
    expect(r.lines[0].unitPrice).toBe(36_500);
    // 0.5 * 36500 = 18250
    expect(r.totalNet).toBe(18_250);
  });
});

describe("computeDteAmounts — Fórmula IVA correcta", () => {
  it("IVA es siempre 19% sobre net (taxRate retorna 19, no 0.19)", async () => {
    const r = await computeDteAmounts({
      currency: "CLP",
      dteType: 33,
      lines: [{ ...baseLine, unitPrice: 100_000 }],
    });
    expect(r.taxRate).toBe(19);
    expect(r.taxAmount).toBe(19_000);
  });

  it("Boleta Electrónica (39) también lleva IVA", async () => {
    const r = await computeDteAmounts({
      currency: "CLP",
      dteType: 39,
      lines: [{ ...baseLine, unitPrice: 1_000_000 }],
    });
    expect(r.taxAmount).toBe(190_000);
  });
});
