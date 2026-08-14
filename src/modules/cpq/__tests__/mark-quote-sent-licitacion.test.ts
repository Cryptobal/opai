import { beforeEach, describe, expect, it, vi } from "vitest";

const findQuote = vi.fn();
const findDeal = vi.fn();
const findStage = vi.fn();
const updateQuoteMany = vi.fn();
const createHistory = vi.fn();
const findQuoteAfter = vi.fn();

const markDealProposalSent = vi.fn();
const advanceDealToQuoteSentStage = vi.fn();
const syncLeadOnProposalSent = vi.fn();
const syncContractItemForQuote = vi.fn();
const computeCpqQuoteCosts = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    cpqQuote: {
      findFirst: (...args: unknown[]) => findQuote(...args),
      updateMany: (...args: unknown[]) => updateQuoteMany(...args),
    },
    crmDeal: { findFirst: (...args: unknown[]) => findDeal(...args) },
    crmPipelineStage: { findFirst: (...args: unknown[]) => findStage(...args) },
    crmHistoryLog: { create: (...args: unknown[]) => createHistory(...args) },
  },
}));

vi.mock("@/lib/crm/advance-deal-on-quote-sent", () => ({
  markDealProposalSent: (...args: unknown[]) => markDealProposalSent(...args),
  advanceDealToQuoteSentStage: (...args: unknown[]) => advanceDealToQuoteSentStage(...args),
}));

vi.mock("@/lib/crm/sync-lead-on-proposal-sent", () => ({
  syncLeadOnProposalSent: (...args: unknown[]) => syncLeadOnProposalSent(...args),
}));

vi.mock("@/modules/finance/cashflow/generators/sales-contract-sync", () => ({
  syncContractItemForQuote: (...args: unknown[]) => syncContractItemForQuote(...args),
}));

vi.mock("@/modules/cpq/costing/compute-quote-costs", () => ({
  computeCpqQuoteCosts: (...args: unknown[]) => computeCpqQuoteCosts(...args),
}));

import {
  markQuoteSentLicitacion,
  MarkQuoteSentLicitacionError,
} from "../send/mark-quote-sent-licitacion";

const baseQuote = {
  id: "q1",
  tenantId: "t1",
  status: "draft",
  code: "CPQ-1",
  name: "Licitación Enex",
  dealId: "d1",
  accountId: "a1",
  contactId: "c1",
  createdFromLeadId: null,
  installationId: null,
  monthlyCost: 100,
  positions: [{ id: "p1", numGuards: 2, numPuestos: 1 }],
  additionalLines: [],
  visibleInClientPortal: null,
};

describe("markQuoteSentLicitacion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findQuote
      .mockResolvedValueOnce(baseQuote)
      .mockResolvedValueOnce({
        id: "q1",
        status: "sent",
        code: "CPQ-1",
        name: "Licitación Enex",
        dealId: "d1",
        visibleInClientPortal: null,
      });
    findDeal.mockResolvedValue({ id: "d1", stageId: "s-prosp", isLicitacion: true });
    findStage.mockResolvedValue({ id: "s-neg", name: "Negociación" });
    updateQuoteMany.mockResolvedValue({ count: 1 });
    markDealProposalSent.mockResolvedValue(undefined);
    advanceDealToQuoteSentStage.mockResolvedValue({ moved: true, stageId: "s-neg" });
    createHistory.mockResolvedValue({});
    syncLeadOnProposalSent.mockResolvedValue(undefined);
    syncContractItemForQuote.mockResolvedValue(undefined);
    computeCpqQuoteCosts.mockResolvedValue({ monthlyTotal: 227 });
  });

  it("marca sent, avanza a Negociación y no toca portal", async () => {
    const result = await markQuoteSentLicitacion({
      quoteId: "q1",
      tenantId: "t1",
      userId: "u1",
    });

    expect(updateQuoteMany).toHaveBeenCalled();
    expect(markDealProposalSent).toHaveBeenCalled();
    expect(advanceDealToQuoteSentStage).toHaveBeenCalledWith(
      expect.objectContaining({
        dealId: "d1",
        targetStageId: "s-neg",
        changedBy: "u1",
      }),
    );
    expect(createHistory).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "quote_sent_licitacion",
        entityId: "q1",
      }),
    });
    expect(result.quote.status).toBe("sent");
    expect(result.stageName).toBe("Negociación");
    expect(result.stageMoved).toBe(true);
  });

  it("rechaza si el negocio no es licitación", async () => {
    findQuote.mockReset();
    findQuote.mockResolvedValueOnce(baseQuote);
    findDeal.mockResolvedValue({ id: "d1", stageId: "s1", isLicitacion: false });

    await expect(
      markQuoteSentLicitacion({ quoteId: "q1", tenantId: "t1", userId: "u1" }),
    ).rejects.toBeInstanceOf(MarkQuoteSentLicitacionError);

    expect(updateQuoteMany).not.toHaveBeenCalled();
  });

  it("rechaza si ya está enviada", async () => {
    findQuote.mockReset();
    findQuote.mockResolvedValueOnce({ ...baseQuote, status: "sent" });

    await expect(
      markQuoteSentLicitacion({ quoteId: "q1", tenantId: "t1", userId: "u1" }),
    ).rejects.toMatchObject({ message: expect.stringContaining("ya está marcada") });
  });

  it("usa alias Negociando si no existe Negociación", async () => {
    findStage
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "s-neg-legacy", name: "Negociando" });

    const result = await markQuoteSentLicitacion({
      quoteId: "q1",
      tenantId: "t1",
      userId: "u1",
    });

    expect(advanceDealToQuoteSentStage).toHaveBeenCalledWith(
      expect.objectContaining({ targetStageId: "s-neg-legacy" }),
    );
    expect(result.stageName).toBe("Negociando");
  });

  it("exige propuesta aprobada cuando hay contenido v2 de licitación", async () => {
    findQuote.mockReset();
    findQuote.mockResolvedValueOnce({
      ...baseQuote,
      proposalMode: "licitacion",
      proposalStatus: "borrador",
      proposalAiContent: { version: 2, mode: "licitacion" },
    });
    findDeal.mockResolvedValue({ id: "d1", stageId: "s1", isLicitacion: true });

    await expect(
      markQuoteSentLicitacion({ quoteId: "q1", tenantId: "t1", userId: "u1" }),
    ).rejects.toMatchObject({ message: expect.stringContaining("aprobada") });
    expect(updateQuoteMany).not.toHaveBeenCalled();
  });
});
