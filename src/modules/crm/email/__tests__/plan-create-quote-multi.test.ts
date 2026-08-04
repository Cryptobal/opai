import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createBundle: vi.fn(),
  linkQuoteToBundle: vi.fn(),
  createPlanQuote: vi.fn(),
  bundleUpdate: vi.fn(),
  historyLog: vi.fn(),
}));

vi.mock("@/modules/cpq/bundles/bundle.service", () => ({
  createBundle: (...args: unknown[]) => mocks.createBundle(...args),
}));

vi.mock("@/modules/cpq/bundles/bundle-members.service", () => ({
  linkQuoteToBundle: (...args: unknown[]) => mocks.linkQuoteToBundle(...args),
}));

vi.mock("../plan-create-quote", () => ({
  createPlanQuote: (...args: unknown[]) => mocks.createPlanQuote(...args),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    cpqProposalBundle: { update: mocks.bundleUpdate },
  },
}));

vi.mock("@/lib/crm-history", () => ({
  createCrmHistoryLog: (...args: unknown[]) => mocks.historyLog(...args),
}));

import { createPlanQuotesMultiInstallation } from "../plan-create-quote-multi";
import { emptyCrmStructureProposal } from "../email-to-crm-structure.types";
import type { CrmStructureCoverageSlot } from "../email-to-crm-structure.types";

function slot(name: string, headcount = 2): CrmStructureCoverageSlot {
  return {
    name,
    role: null,
    regimen: "4x4",
    dias: ["lunes"],
    horaInicio: "08:00",
    horaFin: "20:00",
    simultaneous: 1,
    notes: null,
    weeklyHH: 40,
    headcount,
    pattern: "4x4",
    staffingRationale: "",
  };
}

describe("createPlanQuotesMultiInstallation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createBundle.mockResolvedValue({
      id: "bundle-1",
      code: "PROP-2026-001",
      primaryQuoteId: null,
    });
    mocks.linkQuoteToBundle.mockResolvedValue({});
    mocks.bundleUpdate.mockResolvedValue({});
    mocks.historyLog.mockResolvedValue(undefined);
    let n = 0;
    mocks.createPlanQuote.mockImplementation(async (params: { onlyInstallationIndex?: number }) => {
      n += 1;
      return {
        quoteId: `quote-${n}`,
        quoteUrl: `/cpq/quotes/quote-${n}`,
        code: `CPQ-2026-00${n}`,
        positionsCreated: params.onlyInstallationIndex === 0 ? 2 : 1,
      };
    });
  });

  it("crea bundle + N quotes con installationId y solo sus slots", async () => {
    const proposal = emptyCrmStructureProposal();
    proposal.account.name = "Coexpan";
    proposal.deal.title = "Licitación Coexpan";
    proposal.installations = [
      {
        name: "Planta",
        address: null,
        commune: null,
        city: null,
        mapsUrl: null,
        coverageSlots: [slot("A"), slot("B")],
      },
      {
        name: "Centro Logístico",
        address: null,
        commune: null,
        city: null,
        mapsUrl: null,
        coverageSlots: [slot("C")],
      },
      {
        name: "Vacía",
        address: null,
        commune: null,
        city: null,
        mapsUrl: null,
        coverageSlots: [],
      },
    ];

    const result = await createPlanQuotesMultiInstallation({
      tenantId: "t1",
      userId: "u1",
      dealId: "deal-1",
      accountId: "acc-1",
      contactId: "c1",
      threadId: "th-1",
      proposal,
      quoteInput: {
        name: "Propuesta Coexpan",
        currency: "UF",
        contractDuration: 12,
        isOngoingService: true,
        validUntil: null,
      },
      createdInstallations: [
        { id: "inst-planta", name: "Planta" },
        { id: "inst-centro", name: "Centro Logístico" },
        { id: "inst-vacia", name: "Vacía" },
      ],
    });

    expect(mocks.createBundle).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "t1",
        dealId: "deal-1",
        importDealQuotes: false,
        name: "Propuesta Coexpan",
      }),
    );
    // Solo instalaciones con slots → 2 quotes (Vacía omitida).
    expect(mocks.createPlanQuote).toHaveBeenCalledTimes(2);
    expect(mocks.createPlanQuote).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        onlyInstallationIndex: 0,
        installationId: "inst-planta",
        nameOverride: "Propuesta Coexpan — Planta",
      }),
    );
    expect(mocks.createPlanQuote).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        onlyInstallationIndex: 1,
        installationId: "inst-centro",
        nameOverride: "Propuesta Coexpan — Centro Logístico",
      }),
    );
    expect(mocks.linkQuoteToBundle).toHaveBeenCalledTimes(2);
    expect(mocks.linkQuoteToBundle).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        bundleId: "bundle-1",
        quoteId: "quote-1",
        currency: "UF",
        bundleCurrency: "UF",
      }),
    );
    expect(mocks.linkQuoteToBundle).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ quoteId: "quote-2" }),
    );
    expect(mocks.bundleUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "bundle-1" },
        data: expect.objectContaining({
          currency: "UF",
          contractDuration: 12,
          isOngoingService: true,
        }),
      }),
    );
    expect(mocks.historyLog).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "bundle",
        entityId: "bundle-1",
        action: "bundle_created",
        details: expect.objectContaining({ source: "correo_plan_acciones" }),
      }),
    );
    expect(result.bundleCode).toBe("PROP-2026-001");
    expect(result.bundleUrl).toBe("/cpq/quotes/quote-1");
    expect(result.quotes).toHaveLength(2);
    expect(result.quotes[0].installationName).toBe("Planta");
    expect(result.quotes[1].installationName).toBe("Centro Logístico");
    expect(result.positionsCreated).toBe(3);
  });

  it("error en una quote no aborta las demás", async () => {
    mocks.createPlanQuote
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({
        quoteId: "quote-ok",
        quoteUrl: "/cpq/quotes/quote-ok",
        code: "CPQ-2026-009",
        positionsCreated: 1,
      });

    const proposal = emptyCrmStructureProposal();
    proposal.installations = [
      {
        name: "A",
        address: null,
        commune: null,
        city: null,
        mapsUrl: null,
        coverageSlots: [slot("1")],
      },
      {
        name: "B",
        address: null,
        commune: null,
        city: null,
        mapsUrl: null,
        coverageSlots: [slot("2")],
      },
    ];

    const result = await createPlanQuotesMultiInstallation({
      tenantId: "t1",
      userId: "u1",
      dealId: "deal-1",
      accountId: "acc-1",
      proposal,
      createdInstallations: [
        { id: "ia", name: "A" },
        { id: "ib", name: "B" },
      ],
    });

    expect(result.quotes).toHaveLength(1);
    expect(result.quotes[0].id).toBe("quote-ok");
    expect(result.quotes[0].installationName).toBe("B");
    expect(mocks.linkQuoteToBundle).toHaveBeenCalledTimes(1);
  });

  it("consume nombres duplicados en orden al matchear installationId", async () => {
    const proposal = emptyCrmStructureProposal();
    proposal.installations = [
      {
        name: "Planta",
        address: null,
        commune: null,
        city: null,
        mapsUrl: null,
        coverageSlots: [slot("1")],
      },
      {
        name: "Planta",
        address: null,
        commune: null,
        city: null,
        mapsUrl: null,
        coverageSlots: [slot("2")],
      },
    ];

    await createPlanQuotesMultiInstallation({
      tenantId: "t1",
      userId: "u1",
      dealId: "deal-1",
      accountId: "acc-1",
      proposal,
      createdInstallations: [
        { id: "inst-1", name: "Planta" },
        { id: "inst-2", name: "Planta" },
      ],
    });

    expect(mocks.createPlanQuote).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ installationId: "inst-1", onlyInstallationIndex: 0 }),
    );
    expect(mocks.createPlanQuote).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ installationId: "inst-2", onlyInstallationIndex: 1 }),
    );
  });
});
