import { describe, expect, it } from "vitest";
import {
  computeBundleTotals,
  conditionsAreSynced,
  type BundleQuoteTotalsInput,
} from "../bundle-totals";

function q(
  partial: Partial<BundleQuoteTotalsInput> & { quoteId: string },
): BundleQuoteTotalsInput {
  return {
    includedInProposal: true,
    monthlyCost: 100,
    totalGuards: 2,
    totalPositions: 1,
    marginPct: 13,
    currency: "UF",
    installationName: "Inst",
    ...partial,
  };
}

describe("computeBundleTotals", () => {
  it("suma monthlyCost, guards y positions de incluidas", () => {
    const totals = computeBundleTotals([
      q({ quoteId: "a", monthlyCost: 100, totalGuards: 3, totalPositions: 2 }),
      q({ quoteId: "b", monthlyCost: 50, totalGuards: 1, totalPositions: 1 }),
      q({
        quoteId: "c",
        monthlyCost: 999,
        totalGuards: 10,
        includedInProposal: false,
      }),
    ]);
    expect(totals.totalMonthly).toBe(150);
    expect(totals.totalGuards).toBe(4);
    expect(totals.totalPositions).toBe(3);
    expect(totals.includedCount).toBe(2);
    expect(totals.installationCount).toBe(3);
  });

  it("calcula margen ponderado por monthlyCost", () => {
    const totals = computeBundleTotals([
      q({ quoteId: "a", monthlyCost: 100, marginPct: 10 }),
      q({ quoteId: "b", monthlyCost: 300, marginPct: 20 }),
    ]);
    // (100*10 + 300*20) / 400 = 17.5
    expect(totals.weightedMarginPct).toBeCloseTo(17.5, 5);
  });

  it("retorna null de margen si no hay base", () => {
    const totals = computeBundleTotals([
      q({ quoteId: "a", monthlyCost: 0, marginPct: 13 }),
      q({ quoteId: "b", monthlyCost: 50, marginPct: null, includedInProposal: true }),
    ]);
    expect(totals.weightedMarginPct).toBeNull();
  });

  it("usa moneda del primer incluido", () => {
    const totals = computeBundleTotals([
      q({ quoteId: "a", currency: "CLP", includedInProposal: false }),
      q({ quoteId: "b", currency: "UF" }),
    ]);
    expect(totals.currency).toBe("UF");
  });
});

describe("conditionsAreSynced", () => {
  it("true si todos coinciden", () => {
    const ref = { paymentTerms: "contrafactura", currency: "UF", contractDuration: 12 };
    expect(
      conditionsAreSynced(ref, [
        { paymentTerms: "contrafactura", currency: "UF", contractDuration: 12 },
      ]),
    ).toBe(true);
  });

  it("false si algún campo difiere", () => {
    const ref = { paymentTerms: "contrafactura", currency: "UF" };
    expect(
      conditionsAreSynced(ref, [
        { paymentTerms: "30dias", currency: "UF" },
      ]),
    ).toBe(false);
  });
});
