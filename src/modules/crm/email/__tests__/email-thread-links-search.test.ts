import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    crmInstallation: { findMany: vi.fn() },
    cpqQuote: { findMany: vi.fn() },
    document: { findMany: vi.fn() },
    docAssociation: { findMany: vi.fn() },
    crmAccount: { findFirst: vi.fn(), findMany: vi.fn() },
    financeDte: { findMany: vi.fn() },
    opsGuardia: { findMany: vi.fn() },
    financeSupplier: { findMany: vi.fn() },
    calendarEvent: { findMany: vi.fn() },
    opsTicket: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { searchThreadLinkCandidates } from "../email-thread-links";

describe("searchThreadLinkCandidates — alcance por cuenta", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("con accountId solo busca instalaciones de esa cuenta", async () => {
    vi.mocked(prisma.crmInstallation.findMany).mockResolvedValue([
      {
        id: "i1",
        name: "NS Casa Matriz",
        commune: "Santiago",
        status: "active",
        accountId: "acc1",
      },
    ] as never);

    const result = await searchThreadLinkCandidates({
      tenantId: "t1",
      type: "installation",
      q: "",
      accountId: "acc1",
    });

    expect(result.accountScopeApplies).toBe(true);
    expect(prisma.crmInstallation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: "t1", accountId: "acc1" }),
      }),
    );
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({ id: "i1", scope: "account" });
  });

  it("con dealId acota cotizaciones a ese negocio", async () => {
    vi.mocked(prisma.cpqQuote.findMany).mockResolvedValue([
      {
        id: "q1",
        code: "COT-2026-0001",
        name: "Residencia",
        status: "draft",
        accountId: "acc1",
        clientName: "Suecia",
      },
    ] as never);
    vi.mocked(prisma.crmAccount.findMany).mockResolvedValue([
      { id: "acc1", name: "Embajada De Suecia" },
    ] as never);

    const result = await searchThreadLinkCandidates({
      tenantId: "t1",
      type: "quote",
      q: "",
      accountId: "acc1",
      dealId: "deal1",
    });

    expect(prisma.cpqQuote.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "t1",
          dealId: "deal1",
        }),
      }),
    );
    expect(result.candidates[0]).toMatchObject({ id: "q1", scope: "account" });
  });

  it("sin accountId no aplica agrupamiento", async () => {
    vi.mocked(prisma.crmInstallation.findMany).mockResolvedValue([
      {
        id: "i1",
        name: "NS Casa Matriz",
        commune: null,
        status: "active",
        accountId: "acc1",
      },
    ] as never);

    const result = await searchThreadLinkCandidates({
      tenantId: "t1",
      type: "installation",
      q: "",
    });
    expect(result.accountScopeApplies).toBe(false);
    expect(result.candidates[0].scope).toBe("tenant");
  });
});
