import { describe, expect, it } from "vitest";
import {
  computeFinancialAndPolicy,
  type FinancialPolicyInput,
} from "../financial-policy";

const UF = 40_845;

function base(overrides: Partial<FinancialPolicyInput> = {}): FinancialPolicyInput {
  return {
    baseWithMargin: 8_000_000,
    additionalLinesTotalWithMargin: 0,
    costsBase: 7_000_000,
    additionalLinesTotalBase: 0,
    financialEnabled: false,
    financialRatePct: 2.5,
    financialBaseMode: "auto",
    salePriceBase: 0,
    policyEnabled: false,
    policyAmountMode: "pct",
    policyContractMonths: 12,
    policyContractPct: 10,
    policyRatePct: 2,
    policyAdminRatePct: 0.2,
    policyFixedAmountUF: 0,
    liabilityEnabled: false,
    liabilityMode: "premium",
    liabilityRatePct: 0.3,
    liabilityAnnualPremiumUF: 0,
    liabilityAllocationPct: 100,
    insurancePolicyUF: 1500,
    liabilityDeductibleUF: 0,
    ufValue: UF,
    ...overrides,
  };
}

function reconstruct(r: ReturnType<typeof computeFinancialAndPolicy>, B: number) {
  return (
    B +
    r.monthlyLiability +
    r.monthlyFinancial +
    r.monthlyPolicy +
    r.monthlyPolicyAdmin
  );
}

describe("computeFinancialAndPolicy", () => {
  it("sin ningún instrumento: S = B", () => {
    const r = computeFinancialAndPolicy(base());
    expect(r.salePriceMonthly).toBe(8_000_000);
    expect(r.monthlyFinancial).toBe(0);
    expect(r.monthlyPolicy).toBe(0);
    expect(r.monthlyPolicyAdmin).toBe(0);
    expect(r.monthlyLiability).toBe(0);
    expect(r.grossUpApplied).toBe(false);
  });

  it("solo financiero con gross-up", () => {
    const r = computeFinancialAndPolicy(
      base({ financialEnabled: true, financialRatePct: 2.5 }),
    );
    // S = 8_000_000 / (1 - 0.025) = 8_205_128.205...
    expect(r.salePriceMonthly).toBe(Math.round(8_000_000 / 0.975));
    expect(r.monthlyFinancial).toBeCloseTo(r.salePriceMonthly * 0.025, 0);
    expect(r.grossUpApplied).toBe(true);
    expect(
      Math.abs(reconstruct(r, 8_000_000) - r.salePriceMonthly),
    ).toBeLessThanOrEqual(1);
  });

  it("financiero + garantía pct", () => {
    const r = computeFinancialAndPolicy(
      base({
        financialEnabled: true,
        financialRatePct: 2.5,
        policyEnabled: true,
        policyAmountMode: "pct",
        policyContractPct: 10,
        policyRatePct: 2,
        policyAdminRatePct: 0,
        policyContractMonths: 12,
      }),
    );
    // kG = 0.10 * (12 * 0.02 / 12) = 0.002; k = 0.027
    const k = 0.025 + 0.002;
    const expectedS = 8_000_000 / (1 - k);
    expect(r.salePriceMonthly).toBe(Math.round(expectedS));
    expect(r.grossUpApplied).toBe(true);
    expect(
      Math.abs(reconstruct(r, 8_000_000) - r.salePriceMonthly),
    ).toBeLessThanOrEqual(1);
  });

  it("garantía pct + derechos de emisión", () => {
    const r = computeFinancialAndPolicy(
      base({
        financialEnabled: true,
        financialRatePct: 2.5,
        policyEnabled: true,
        policyAmountMode: "pct",
        policyContractPct: 10,
        policyRatePct: 2,
        policyAdminRatePct: 0.2,
        policyContractMonths: 12,
      }),
    );
    // kG = 0.10 * (0.02 + 0.002) = 0.0022; k = 0.0272
    const kG = 0.1 * ((12 * 0.02) / 12 + 0.002);
    const k = 0.025 + kG;
    expect(r.k).toBeCloseTo(k, 6);
    expect(r.monthlyPolicyAdmin).toBeGreaterThan(0);
    expect(
      Math.abs(reconstruct(r, 8_000_000) - r.salePriceMonthly),
    ).toBeLessThanOrEqual(1);
  });

  it("garantía modo fija", () => {
    const r = computeFinancialAndPolicy(
      base({
        financialEnabled: false,
        policyEnabled: true,
        policyAmountMode: "fija",
        policyFixedAmountUF: 100,
        policyRatePct: 2,
        policyAdminRatePct: 0.2,
        policyContractMonths: 12,
      }),
    );
    const guaranteed = 100 * UF;
    const policy = (guaranteed * 0.02) / 12;
    const admin = (guaranteed * 0.002) / 12;
    expect(r.policyGuaranteedAmount).toBeCloseTo(guaranteed, 0);
    expect(r.monthlyPolicy).toBeCloseTo(policy, 0);
    expect(r.monthlyPolicyAdmin).toBeCloseTo(admin, 0);
    expect(r.salePriceMonthly).toBe(Math.round(8_000_000 + policy + admin));
    expect(
      Math.abs(reconstruct(r, 8_000_000) - r.salePriceMonthly),
    ).toBeLessThanOrEqual(1);
  });

  it("RC modo premium", () => {
    const r = computeFinancialAndPolicy(
      base({
        liabilityEnabled: true,
        liabilityMode: "premium",
        liabilityAnnualPremiumUF: 90,
        liabilityAllocationPct: 100,
      }),
    );
    const rc = (90 * UF) / 12;
    expect(r.monthlyLiability).toBeCloseTo(rc, 0);
    expect(r.salePriceMonthly).toBe(Math.round(8_000_000 + rc));
  });

  it("RC modo rate", () => {
    const r = computeFinancialAndPolicy(
      base({
        liabilityEnabled: true,
        liabilityMode: "rate",
        insurancePolicyUF: 30_000,
        liabilityRatePct: 0.3,
        liabilityAllocationPct: 100,
      }),
    );
    const annual = 30_000 * UF * 0.003;
    const rc = annual / 12;
    expect(r.annualPremiumCLP).toBeCloseTo(annual, 0);
    expect(r.monthlyLiability).toBeCloseTo(rc, 0);
  });

  it("RC con allocation 25%", () => {
    const full = computeFinancialAndPolicy(
      base({
        liabilityEnabled: true,
        liabilityMode: "premium",
        liabilityAnnualPremiumUF: 90,
        liabilityAllocationPct: 100,
      }),
    );
    const part = computeFinancialAndPolicy(
      base({
        liabilityEnabled: true,
        liabilityMode: "premium",
        liabilityAnnualPremiumUF: 90,
        liabilityAllocationPct: 25,
      }),
    );
    expect(part.monthlyLiability).toBeCloseTo(full.monthlyLiability * 0.25, 0);
  });

  it("guarda k ≥ 0.35", () => {
    const r = computeFinancialAndPolicy(
      base({
        financialEnabled: true,
        financialRatePct: 40,
      }),
    );
    expect(r.grossUpApplied).toBe(false);
    expect(r.k).toBeGreaterThanOrEqual(0.35);
    expect(r.warnings.some((w) => w.includes("35"))).toBe(true);
    // S = B * (1 + k)
    expect(r.salePriceMonthly).toBe(Math.round(8_000_000 * 1.4));
  });

  it("Mg ≠ 12 afecta derechos y kG", () => {
    const m12 = computeFinancialAndPolicy(
      base({
        policyEnabled: true,
        policyAmountMode: "pct",
        policyContractPct: 10,
        policyRatePct: 2,
        policyAdminRatePct: 0.2,
        policyContractMonths: 12,
      }),
    );
    const m24 = computeFinancialAndPolicy(
      base({
        policyEnabled: true,
        policyAmountMode: "pct",
        policyContractPct: 10,
        policyRatePct: 2,
        policyAdminRatePct: 0.2,
        policyContractMonths: 24,
      }),
    );
    // kG_12 = 0.1*(0.02+0.002)=0.0022; kG_24 = 0.1*(24*0.02/12 + 0.002)=0.1*(0.04+0.002)=0.0042
    expect(m24.k).toBeGreaterThan(m12.k);
    expect(m24.salePriceMonthly).toBeGreaterThan(m12.salePriceMonthly);
  });

  it("manual: equivalencia exacta con motor histórico (admin=0, sin RC)", () => {
    const salePriceBase = 9_000_000;
    const baseWithMargin = 8_000_000;
    const r = computeFinancialAndPolicy(
      base({
        financialBaseMode: "manual",
        salePriceBase,
        baseWithMargin,
        financialEnabled: true,
        financialRatePct: 2.5,
        policyEnabled: true,
        policyAmountMode: "pct",
        policyContractMonths: 12,
        policyContractPct: 100,
        policyRatePct: 2,
        policyAdminRatePct: 0,
        liabilityEnabled: false,
      }),
    );
    const monthlyFinancial = salePriceBase * 0.025;
    const valorGarantia = salePriceBase * 12 * 1;
    const monthlyPolicy = (valorGarantia * 0.02) / 12;
    expect(r.monthlyFinancial).toBeCloseTo(monthlyFinancial, 6);
    expect(r.monthlyPolicy).toBeCloseTo(monthlyPolicy, 6);
    expect(r.monthlyPolicyAdmin).toBe(0);
    expect(r.salePriceMonthly).toBe(
      Math.round(baseWithMargin + monthlyFinancial + monthlyPolicy),
    );
  });

  it("ufValue = 0 con RC rate: no calcula, marca missingUf", () => {
    const r = computeFinancialAndPolicy(
      base({
        ufValue: 0,
        liabilityEnabled: true,
        liabilityMode: "rate",
        insurancePolicyUF: 30_000,
        liabilityRatePct: 0.3,
      }),
    );
    expect(r.missingUf).toBe(true);
    expect(r.monthlyLiability).toBe(0);
    expect(r.warnings).toContain("falta valor UF");
  });

  it("líneas one-time no entran al gross-up (solo additionalLinesTotalWithMargin)", () => {
    const without = computeFinancialAndPolicy(
      base({ financialEnabled: true, financialRatePct: 2.5 }),
    );
    const withAddl = computeFinancialAndPolicy(
      base({
        financialEnabled: true,
        financialRatePct: 2.5,
        additionalLinesTotalWithMargin: 500_000,
      }),
    );
    // One-time lines must NOT be passed as additionalLinesTotalWithMargin;
    // if passed, they raise B. Confirm the monthly path includes them when provided.
    expect(withAddl.salePriceMonthly).toBeGreaterThan(without.salePriceMonthly);
    expect(
      Math.abs(
        reconstruct(withAddl, 8_000_000 + 500_000) - withAddl.salePriceMonthly,
      ),
    ).toBeLessThanOrEqual(1);
  });

  it("consistencia aritmética con parámetros aleatorios acotados", () => {
    for (let i = 0; i < 40; i++) {
      const B = 1_000_000 + i * 123_456;
      const f = (i % 10) * 0.3;
      const pG = 5 + (i % 15);
      const rG = 1 + (i % 3) * 0.5;
      const eG = (i % 5) * 0.1;
      const r = computeFinancialAndPolicy(
        base({
          baseWithMargin: B,
          financialEnabled: f > 0,
          financialRatePct: f,
          policyEnabled: true,
          policyAmountMode: "pct",
          policyContractPct: pG,
          policyRatePct: rG,
          policyAdminRatePct: eG,
          policyContractMonths: 12 + (i % 2) * 12,
          liabilityEnabled: i % 3 === 0,
          liabilityMode: "premium",
          liabilityAnnualPremiumUF: i % 3 === 0 ? 50 + i : 0,
        }),
      );
      expect(
        Math.abs(reconstruct(r, B) - r.salePriceMonthly),
      ).toBeLessThanOrEqual(1);
    }
  });
});
