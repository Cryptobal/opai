import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dealFindFirst: vi.fn(),
  quoteCreate: vi.fn(),
  dealQuoteCreate: vi.fn(),
  threadLinkUpsert: vi.fn(),
  historyLog: vi.fn(),
  applyIncludes: vi.fn(),
  materialize: vi.fn(),
  nextDocumentCode: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    crmDeal: { findFirst: mocks.dealFindFirst },
    cpqQuote: { create: mocks.quoteCreate },
    crmDealQuote: { create: mocks.dealQuoteCreate },
    crmEmailThreadLink: { upsert: mocks.threadLinkUpsert },
    $transaction: (fn: (tx: unknown) => unknown) => mocks.transaction(fn),
  },
}));

vi.mock("@/lib/cpq/document-counter", () => ({
  nextDocumentCode: (...args: unknown[]) => mocks.nextDocumentCode(...args),
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
    mocks.nextDocumentCode.mockResolvedValue("CPQ-2026-011");
    mocks.quoteCreate.mockResolvedValue({ id: "quote-1", code: "CPQ-2026-011" });
    mocks.dealQuoteCreate.mockResolvedValue({});
    mocks.threadLinkUpsert.mockResolvedValue({});
    mocks.historyLog.mockResolvedValue(undefined);
    mocks.applyIncludes.mockResolvedValue(undefined);
    mocks.materialize.mockResolvedValue({ positionsCreated: 2 });
    mocks.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        cpqQuote: { create: mocks.quoteCreate },
        cpqDocumentCounter: {
          upsert: vi.fn().mockResolvedValue({ lastNumber: 11 }),
        },
      };
      return fn(tx);
    });
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

    expect(mocks.nextDocumentCode).toHaveBeenCalled();
    expect(mocks.quoteCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          contactId: "contact-1",
          installationId: "inst-1",
          accountId: "acc-1",
          dealId: "deal-1",
          code: "CPQ-2026-011",
        }),
      }),
    );
    expect(mocks.materialize).toHaveBeenCalledWith(
      expect.objectContaining({ quoteId: "quote-1", tenantId: "t1" }),
    );
    expect(mocks.threadLinkUpsert).not.toHaveBeenCalled();
  });

  it("con threadId crea vínculo quote linkedVia ai", async () => {
    const proposal = emptyCrmStructureProposal();
    proposal.account.name = "Maclean";

    const result = await createPlanQuote({
      tenantId: "t1",
      userId: "u1",
      dealId: "deal-1",
      accountId: "acc-1",
      threadId: "th-1",
      proposal,
    });

    expect(result.quoteId).toBe("quote-1");
    expect(mocks.threadLinkUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          threadId_entityType_entityId: {
            threadId: "th-1",
            entityType: "quote",
            entityId: "quote-1",
          },
        },
        create: expect.objectContaining({
          tenantId: "t1",
          threadId: "th-1",
          entityType: "quote",
          entityId: "quote-1",
          linkedVia: "ai",
          createdBy: "u1",
        }),
        update: {},
      }),
    );
  });

  it("si el upsert del vínculo falla, igual resuelve con quoteId", async () => {
    mocks.threadLinkUpsert.mockRejectedValue(new Error("db down"));
    const proposal = emptyCrmStructureProposal();
    proposal.account.name = "Maclean";

    const result = await createPlanQuote({
      tenantId: "t1",
      userId: "u1",
      dealId: "deal-1",
      accountId: "acc-1",
      threadId: "th-1",
      proposal,
    });

    expect(result.quoteId).toBe("quote-1");
    expect(mocks.threadLinkUpsert).toHaveBeenCalled();
  });

  it("sin dealId crea cotización en la cuenta y no crea CrmDealQuote", async () => {
    const proposal = emptyCrmStructureProposal();
    proposal.account.name = "Maclean";
    proposal.deal.title = null;

    const result = await createPlanQuote({
      tenantId: "t1",
      userId: "u1",
      dealId: null,
      accountId: "acc-1",
      contactId: "contact-1",
      threadId: "th-1",
      proposal,
    });

    expect(result.quoteId).toBe("quote-1");
    expect(mocks.dealFindFirst).not.toHaveBeenCalled();
    expect(mocks.dealQuoteCreate).not.toHaveBeenCalled();
    expect(mocks.quoteCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          accountId: "acc-1",
          contactId: "contact-1",
          name: "Maclean",
        }),
      }),
    );
    const data = mocks.quoteCreate.mock.calls[0][0].data as Record<string, unknown>;
    expect(data).not.toHaveProperty("dealId");
    expect(mocks.threadLinkUpsert).toHaveBeenCalled();
  });
});
