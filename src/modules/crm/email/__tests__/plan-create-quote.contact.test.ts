import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dealFindFirst: vi.fn(),
  quoteCount: vi.fn(),
  quoteCreate: vi.fn(),
  dealQuoteCreate: vi.fn(),
  historyLog: vi.fn(),
  applyIncludes: vi.fn(),
  materialize: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    crmDeal: { findFirst: mocks.dealFindFirst },
    cpqQuote: { count: mocks.quoteCount, create: mocks.quoteCreate },
    crmDealQuote: { create: mocks.dealQuoteCreate },
  },
}));

vi.mock("@/lib/crm-history", () => ({
  createCrmHistoryLog: (...args: unknown[]) => mocks.historyLog(...args),
}));

vi.mock("@/lib/cpq/apply-default-quote-includes", () => ({
  applyDefaultQuoteIncludes: (...args: unknown[]) => mocks.applyIncludes(...args),
}));

vi.mock("@/lib/crm/coverage-slots-to-quote-positions", () => ({
  materializeCoverageSlotsOnQuote: (...args: unknown[]) => mocks.materialize(...args),
}));

import { createPlanQuote } from "../plan-create-quote";
import { emptyCrmStructureProposal } from "../email-to-crm-structure.types";

describe("createPlanQuote contactId + positions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.dealFindFirst.mockResolvedValue({ id: "deal-1", title: "Licitación" });
    mocks.quoteCount.mockResolvedValue(10);
    mocks.quoteCreate.mockResolvedValue({ id: "quote-1", code: "CPQ-2026-011" });
    mocks.dealQuoteCreate.mockResolvedValue({});
    mocks.historyLog.mockResolvedValue(undefined);
    mocks.applyIncludes.mockResolvedValue(undefined);
    mocks.materialize.mockResolvedValue({ positionsCreated: 2 });
  });

  it("persiste contactId e installationId en CpqQuote", async () => {
    const proposal = emptyCrmStructureProposal();
    proposal.account.name = "Maclean";
    proposal.deal.title = "Licitación Parque";

    await createPlanQuote({
      tenantId: "t1",
      userId: "u1",
      dealId: "deal-1",
      accountId: "acc-1",
      contactId: "contact-1",
      installationId: "inst-1",
      proposal,
    });

    expect(mocks.quoteCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          contactId: "contact-1",
          installationId: "inst-1",
          accountId: "acc-1",
          dealId: "deal-1",
        }),
      }),
    );
    expect(mocks.materialize).toHaveBeenCalledWith(
      expect.objectContaining({ quoteId: "quote-1", tenantId: "t1" }),
    );
  });
});
