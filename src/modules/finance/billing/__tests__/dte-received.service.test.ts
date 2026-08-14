import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    financeDte: {
      findMany: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
    },
    financePaymentAllocation: { findMany: vi.fn() },
    crmAccount: { findMany: vi.fn() },
    crmInstallation: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { listReceivedDtes } from "../dte-received.service";

describe("listReceivedDtes search", () => {
  beforeEach(() => {
    vi.mocked(prisma.financeDte.findMany).mockReset();
    vi.mocked(prisma.financeDte.count).mockReset();
    vi.mocked(prisma.financeDte.aggregate).mockReset();
    vi.mocked(prisma.financePaymentAllocation.findMany).mockReset();
    vi.mocked(prisma.financeDte.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.financeDte.count).mockResolvedValue(0);
    vi.mocked(prisma.financeDte.aggregate).mockResolvedValue({
      _sum: { netAmount: 0, totalAmount: 0 },
    } as never);
    vi.mocked(prisma.financePaymentAllocation.findMany).mockResolvedValue([] as never);
  });

  it("RUT con puntos incluye formato SII persistido (11111111-1)", async () => {
    await listReceivedDtes("t1", { search: "11.111.111-1" });
    const where = vi.mocked(prisma.financeDte.findMany).mock.calls[0]?.[0]?.where as {
      direction?: string;
      OR?: Array<{ folio?: number; issuerRut?: { contains: string }; issuerName?: { contains: string } }>;
    };
    expect(where.direction).toBe("RECEIVED");
    const ruts = (where.OR ?? [])
      .map((c) => c.issuerRut?.contains)
      .filter((x): x is string => typeof x === "string");
    expect(ruts).toContain("11.111.111-1");
    expect(ruts).toContain("11111111-1");
  });

  it("folio numérico busca por folio", async () => {
    await listReceivedDtes("t1", { search: "5144" });
    const where = vi.mocked(prisma.financeDte.findMany).mock.calls[0]?.[0]?.where as {
      OR?: Array<{ folio?: number }>;
    };
    expect(where.OR?.some((c) => c.folio === 5144)).toBe(true);
  });
});
