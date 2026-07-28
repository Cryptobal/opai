import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    crmInstallation: { findMany: vi.fn() },
    cpqQuote: { findMany: vi.fn() },
    document: { findMany: vi.fn() },
    docAssociation: { findMany: vi.fn() },
    crmAccount: { findFirst: vi.fn() },
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

  it("marca instalaciones de la cuenta con scope account y el resto tenant", async () => {
    vi.mocked(prisma.crmInstallation.findMany).mockResolvedValue([
      {
        id: "i1",
        name: "NS Casa Matriz",
        commune: "Santiago",
        status: "active",
        accountId: "acc1",
      },
      {
        id: "i2",
        name: "Agua sol",
        commune: "Maipú",
        status: "active",
        accountId: "acc-other",
      },
    ] as never);

    const result = await searchThreadLinkCandidates({
      tenantId: "t1",
      type: "installation",
      q: "",
      accountId: "acc1",
    });

    expect(result.accountScopeApplies).toBe(true);
    expect(result.candidates[0]).toMatchObject({ id: "i1", scope: "account" });
    expect(result.candidates[1]).toMatchObject({ id: "i2", scope: "tenant" });
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
