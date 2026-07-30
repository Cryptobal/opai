/**
 * Tests de propagate-bundle-conditions: bundle → hijas (condiciones + financiero),
 * semántica null = no gobernado, scoping por tenant y recálculo por cotización.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  bundleFindFirst: vi.fn(),
  memberFindMany: vi.fn(),
  quoteUpdateMany: vi.fn(),
  paramsUpsert: vi.fn(),
  refreshQuoteTotals: vi.fn(),
}));

vi.mock("@/lib/prisma", () => {
  const tx = {
    cpqQuote: { updateMany: mocks.quoteUpdateMany },
    cpqQuoteParameters: { upsert: mocks.paramsUpsert },
  };
  return {
    prisma: {
      cpqProposalBundle: { findFirst: mocks.bundleFindFirst },
      cpqProposalBundleQuote: { findMany: mocks.memberFindMany },
      $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<void>) => fn(tx)),
    },
  };
});

vi.mock("@/modules/cpq/costing/compute-quote-costs", () => ({
  refreshQuoteTotals: mocks.refreshQuoteTotals,
}));

import {
  buildQuoteConditionData,
  propagateBundleConditions,
} from "../propagate-bundle-conditions";

const baseBundle = {
  id: "b1",
  currency: "UF",
  validUntil: null,
  paymentTerms: "contrafactura",
  serviceStartDays: 5,
  contractDuration: 12,
  isOngoingService: true,
  adjustmentType: "IPC",
  adjustmentFreq: "ANUAL",
  ipcWeight: null,
  imoWeight: null,
  insurancePolicyUF: 1500,
  liabilityMonths: 3,
  realAnnualIncrement: 3,
  paymentDays: 5,
  paymentDayMode: "SPECIFIC_DAY",
  financialEnabled: true,
  financialRatePct: 2.5,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.bundleFindFirst.mockResolvedValue(baseBundle);
  mocks.memberFindMany.mockResolvedValue([
    { quoteId: "q1" },
    { quoteId: "q2" },
  ]);
  mocks.refreshQuoteTotals.mockResolvedValue(undefined);
});

describe("buildQuoteConditionData", () => {
  it("solo incluye campos no nulos (null = no gobernado)", () => {
    const { quoteData } = buildQuoteConditionData({
      paymentTerms: "30_dias",
      serviceStartDays: null,
      contractDuration: undefined,
    });
    expect(quoteData).toEqual({ paymentTerms: "30_dias" });
  });

  it("propaga currency siempre y validUntil solo si no es null", () => {
    const { quoteData } = buildQuoteConditionData({
      currency: "CLP",
      validUntil: null,
    });
    expect(quoteData).toEqual({ currency: "CLP" });
    const withDate = buildQuoteConditionData({
      currency: "UF",
      validUntil: new Date("2026-12-31"),
    });
    expect(withDate.quoteData.validUntil).toBeInstanceOf(Date);
  });

  it("reajuste NONE limpia frecuencia y pesos del polinomio", () => {
    const { quoteData } = buildQuoteConditionData({
      adjustmentType: "NONE",
      adjustmentFreq: "ANUAL",
      ipcWeight: 60,
    });
    expect(quoteData.adjustmentType).toBe("NONE");
    expect(quoteData.adjustmentFreq).toBeNull();
    expect(quoteData.ipcWeight).toBeNull();
    expect(quoteData.imoWeight).toBeNull();
  });

  it("extrae financiero a parametersData, no a quoteData", () => {
    const { quoteData, parametersData } = buildQuoteConditionData({
      financialEnabled: false,
      financialRatePct: 3.5,
    });
    expect(parametersData).toEqual({
      financialEnabled: false,
      financialRatePct: 3.5,
    });
    expect(quoteData.financialEnabled).toBeUndefined();
    expect(quoteData.financialRatePct).toBeUndefined();
  });
});

describe("propagateBundleConditions", () => {
  it("lanza NOT_FOUND si el bundle no pertenece al tenant", async () => {
    mocks.bundleFindFirst.mockResolvedValue(null);
    await expect(
      propagateBundleConditions({ tenantId: "t1", bundleId: "b1" }),
    ).rejects.toThrow("Propuesta no encontrada");
    expect(mocks.bundleFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "b1", tenantId: "t1" },
      }),
    );
  });

  it("propaga condiciones + financiero a todas las hijas y recalcula", async () => {
    const res = await propagateBundleConditions({
      tenantId: "t1",
      bundleId: "b1",
    });
    expect(res.updatedQuoteIds.sort()).toEqual(["q1", "q2"]);
    expect(mocks.quoteUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: expect.arrayContaining(["q1", "q2"]) }, tenantId: "t1" },
        data: expect.objectContaining({
          paymentTerms: "contrafactura",
          contractDuration: 12,
          adjustmentType: "IPC",
          currency: "UF",
        }),
      }),
    );
    // ipcWeight/imoWeight null en el bundle → no se tocan en las hijas
    const data = mocks.quoteUpdateMany.mock.calls[0][0].data;
    expect("ipcWeight" in data).toBe(false);
    expect(mocks.paramsUpsert).toHaveBeenCalledTimes(2);
    expect(mocks.paramsUpsert).toHaveBeenCalledWith({
      where: { quoteId: "q1" },
      update: { financialEnabled: true, financialRatePct: 2.5 },
      create: { quoteId: "q1", financialEnabled: true, financialRatePct: 2.5 },
    });
    expect(mocks.refreshQuoteTotals).toHaveBeenCalledTimes(2);
  });

  it("quoteIds acota la propagación y descarta ids ajenos al bundle", async () => {
    const res = await propagateBundleConditions({
      tenantId: "t1",
      bundleId: "b1",
      quoteIds: ["q2", "intrusa"],
    });
    expect(res.updatedQuoteIds).toEqual(["q2"]);
    expect(mocks.quoteUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["q2"] }, tenantId: "t1" },
      }),
    );
    expect(mocks.refreshQuoteTotals).toHaveBeenCalledTimes(1);
  });

  it("bundle sin campos gobernados → no escribe ni recalcula", async () => {
    mocks.bundleFindFirst.mockResolvedValue({
      id: "b1",
      currency: null,
      validUntil: null,
      paymentTerms: null,
      serviceStartDays: null,
      contractDuration: null,
      isOngoingService: null,
      adjustmentType: null,
      adjustmentFreq: null,
      ipcWeight: null,
      imoWeight: null,
      insurancePolicyUF: null,
      liabilityMonths: null,
      realAnnualIncrement: null,
      paymentDays: null,
      paymentDayMode: null,
      financialEnabled: null,
      financialRatePct: null,
    });
    const res = await propagateBundleConditions({
      tenantId: "t1",
      bundleId: "b1",
    });
    expect(res.updatedQuoteIds).toEqual([]);
    expect(mocks.quoteUpdateMany).not.toHaveBeenCalled();
    expect(mocks.paramsUpsert).not.toHaveBeenCalled();
    expect(mocks.refreshQuoteTotals).not.toHaveBeenCalled();
  });
});
