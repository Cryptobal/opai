import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    cpqQuote: { findFirst: vi.fn(), findMany: vi.fn() },
    document: { count: vi.fn() },
    crmEmailThreadLink: { count: vi.fn() },
    crmTask: { count: vi.fn() },
    crmDeal: { findFirst: vi.fn() },
    crmDealQuote: { findMany: vi.fn() },
    cpqProposalBundle: { findMany: vi.fn() },
    crmAccount: { findFirst: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { buildQuoteDeleteImpact } from "../quote-delete-impact";

const baseRow = {
  id: "quote-1",
  code: "CPQ-2026-001",
  name: "Cotización test",
  status: "draft",
  contractStartDate: null as Date | null,
  visibleInClientPortal: null as boolean | null,
  _count: { positions: 3, attachments: 1 },
  proposalBundleQuote: null,
};

describe("buildQuoteDeleteImpact — blockers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.crmEmailThreadLink.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.crmTask.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.document.count).mockResolvedValue(0 as never);
  });

  it("retorna null cuando la cotización no existe", async () => {
    vi.mocked(prisma.cpqQuote.findFirst).mockResolvedValue(null as never);
    const impact = await buildQuoteDeleteImpact("tenant-1", "missing");
    expect(impact).toBeNull();
  });

  it("bloquea CONTRACT_GENERATED cuando hay contratos con quoteId en metadata", async () => {
    vi.mocked(prisma.cpqQuote.findFirst).mockResolvedValue({ ...baseRow } as never);
    vi.mocked(prisma.document.count).mockResolvedValue(2 as never);

    const impact = await buildQuoteDeleteImpact("tenant-1", "quote-1");
    expect(impact?.blockers.map((b) => b.code)).toContain("CONTRACT_GENERATED");
    // metadata JSON path filter
    expect(prisma.document.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "tenant-1",
          contractMetadata: { path: ["quoteId"], equals: "quote-1" },
        }),
      }),
    );
  });

  it("bloquea CASHFLOW_FOOTPRINT con status de cashflow + contractStartDate", async () => {
    vi.mocked(prisma.cpqQuote.findFirst).mockResolvedValue({
      ...baseRow,
      status: "active",
      contractStartDate: new Date("2026-01-01"),
    } as never);

    const impact = await buildQuoteDeleteImpact("tenant-1", "quote-1");
    expect(impact?.blockers.map((b) => b.code)).toContain("CASHFLOW_FOOTPRINT");
  });

  it("NO bloquea CASHFLOW_FOOTPRINT si falta contractStartDate", async () => {
    vi.mocked(prisma.cpqQuote.findFirst).mockResolvedValue({
      ...baseRow,
      status: "active",
      contractStartDate: null,
    } as never);

    const impact = await buildQuoteDeleteImpact("tenant-1", "quote-1");
    expect(impact?.blockers.map((b) => b.code)).not.toContain("CASHFLOW_FOOTPRINT");
  });

  it("bloquea PORTAL_ACCEPTED cuando status es approved/accepted", async () => {
    vi.mocked(prisma.cpqQuote.findFirst).mockResolvedValue({
      ...baseRow,
      status: "accepted",
    } as never);

    const impact = await buildQuoteDeleteImpact("tenant-1", "quote-1");
    expect(impact?.blockers.map((b) => b.code)).toContain("PORTAL_ACCEPTED");
  });

  it("sin bloqueos ni bundle en borrador simple, con conteos", async () => {
    vi.mocked(prisma.cpqQuote.findFirst).mockResolvedValue({ ...baseRow } as never);
    vi.mocked(prisma.crmEmailThreadLink.count).mockResolvedValue(4 as never);
    vi.mocked(prisma.crmTask.count).mockResolvedValue(2 as never);

    const impact = await buildQuoteDeleteImpact("tenant-1", "quote-1");
    expect(impact?.blockers).toHaveLength(0);
    expect(impact?.bundle).toBeNull();
    expect(impact?.counts).toEqual({
      positions: 3,
      attachments: 1,
      emailThreads: 4,
      tasks: 2,
    });
  });

  it("advierte cuando la cotización es la única de su propuesta", async () => {
    vi.mocked(prisma.cpqQuote.findFirst).mockResolvedValue({
      ...baseRow,
      proposalBundleQuote: {
        bundle: { id: "bundle-1", code: "PROP-2026-001", _count: { quotes: 1 } },
      },
    } as never);

    const impact = await buildQuoteDeleteImpact("tenant-1", "quote-1");
    expect(impact?.bundle).toEqual({
      id: "bundle-1",
      code: "PROP-2026-001",
      memberCount: 1,
    });
    expect(impact?.warnings.length).toBeGreaterThan(0);
  });
});
