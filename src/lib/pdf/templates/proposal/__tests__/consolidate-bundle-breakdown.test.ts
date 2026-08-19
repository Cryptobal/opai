import { describe, expect, it } from "vitest";
import {
  consolidateQuoteBreakdowns,
  consolidateResourceBreakdowns,
} from "../consolidate-bundle-breakdown";
import type { QuoteBreakdownData } from "@/types/cpq-breakdown";

function bd(over: Partial<QuoteBreakdownData> = {}): QuoteBreakdownData {
  return {
    positions: [
      {
        id: "p1",
        name: "Guardia",
        numGuards: 2,
        numPuestos: 1,
        totalGuardsInPosition: 2,
        baseSalary: 600_000,
        gratification: 150_000,
        totalImponible: 750_000,
        sisEmployer: 0,
        pensionReformEmployer: 0,
        afcEmployer: 0,
        mutualEmployer: 0,
        vacationProvision: 0,
        severanceProvision: 0,
        totalLaborCost: 900_000,
        salePrice: 1_000_000,
        hourlyRateSale: 0,
      },
    ],
    totalLaborCost: 900_000,
    holidayAdjustment: 0,
    uniforms: 100_000,
    exams: 50_000,
    meals: 0,
    vehicles: 0,
    infrastructure: 0,
    equipment: 0,
    transport: 0,
    systems: 0,
    other: 20_000,
    subtotalBase: 1_070_000,
    marginPct: 13,
    marginAmount: 160_000,
    financial: 0,
    financialRatePct: 0,
    policy: 0,
    policyRatePct: 0,
    totalSalePrice: 1_230_000,
    additionalLines: 0,
    grandTotal: 1_230_000,
    monthlyHoursStandard: 180,
    currency: "CLP",
    ...over,
  };
}

describe("consolidateQuoteBreakdowns", () => {
  it("suma montos y concatena posiciones", () => {
    const a = bd();
    const b = bd({
      positions: [
        {
          ...a.positions[0]!,
          id: "p2",
          name: "Guardia noche",
          totalLaborCost: 900_000,
        },
      ],
      totalLaborCost: 900_000,
      uniforms: 80_000,
      totalSalePrice: 1_100_000,
      grandTotal: 1_100_000,
      marginAmount: 140_000,
      subtotalBase: 960_000,
    });

    const merged = consolidateQuoteBreakdowns([a, b])!;
    expect(merged.positions).toHaveLength(2);
    expect(merged.totalLaborCost).toBe(1_800_000);
    expect(merged.uniforms).toBe(180_000);
    expect(merged.grandTotal).toBe(2_330_000);
  });
});

describe("consolidateResourceBreakdowns", () => {
  it("fusiona ítems del mismo nombre en la misma categoría", () => {
    const merged = consolidateResourceBreakdowns([
      [
        {
          category: "Uniformes",
          categoryType: "direct",
          items: [{ name: "Polera", amount: 10_000, quantity: 2 }],
          subtotal: 10_000,
        },
      ],
      [
        {
          category: "Uniformes",
          categoryType: "direct",
          items: [{ name: "Polera", amount: 15_000, quantity: 3 }],
          subtotal: 15_000,
        },
      ],
    ])!;

    expect(merged).toHaveLength(1);
    expect(merged[0]!.items[0]!.amount).toBe(25_000);
    expect(merged[0]!.items[0]!.quantity).toBe(5);
    expect(merged[0]!.subtotal).toBe(25_000);
  });
});
