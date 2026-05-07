import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    financeDte: { findMany: vi.fn() },
    crmAccount: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { getSalesMatrix } from "../sales-matrix.service";
import { buildPeriod } from "../shared/period.helper";

const dteMock = prisma.financeDte.findMany as unknown as ReturnType<typeof vi.fn>;
const accMock = prisma.crmAccount.findMany as unknown as ReturnType<typeof vi.fn>;

const dec = (n: number) => ({ toNumber: () => n });

beforeEach(() => {
  dteMock.mockReset();
  accMock.mockReset();
});

describe("getSalesMatrix", () => {
  it("aggregates net amounts by client × month, NC subtracts", async () => {
    const period = buildPeriod("year", new Date(2026, 0, 15));
    const acc1 = "00000000-0000-0000-0000-000000000001";
    dteMock.mockResolvedValue([
      { id: "1", dteType: 33, date: new Date(2026, 0, 5), totalAmount: dec(119), netAmount: dec(100), crmAccountId: acc1, installationId: null },
      { id: "2", dteType: 56, date: new Date(2026, 0, 10), totalAmount: dec(60), netAmount: dec(50), crmAccountId: acc1, installationId: null },
      { id: "3", dteType: 61, date: new Date(2026, 1, 3), totalAmount: dec(30), netAmount: dec(25), crmAccountId: acc1, installationId: null },
    ]);
    accMock.mockResolvedValue([
      { id: acc1, name: "Cliente Uno", industry: "retail", status: "client_active", installations: [{ id: "i1" }] },
    ]);

    const result = await getSalesMatrix("t1", period);
    expect(result.documentsCount).toBe(3);
    // 100 + 50 - 25 = 125
    expect(result.grandTotal).toBe(125);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].label).toBe("Cliente Uno");
    expect(result.rows[0].monthly[0]).toBe(150); // jan = 100 + 50
    expect(result.rows[0].monthly[1]).toBe(-25); // feb = -25 NC
  });

  it("groups DTEs by receiverRut when crmAccountId missing", async () => {
    const period = buildPeriod("month", new Date(2026, 4, 1));
    dteMock.mockResolvedValue([
      { id: "1", dteType: 33, date: new Date(2026, 4, 5), totalAmount: dec(119), netAmount: dec(100), crmAccountId: null, installationId: null, receiverRut: "76.123.456-7", receiverName: "Empresa Demo SpA" },
      { id: "2", dteType: 33, date: new Date(2026, 4, 7), totalAmount: dec(238), netAmount: dec(200), crmAccountId: null, installationId: null, receiverRut: "76.123.456-7", receiverName: "Empresa Demo SpA" },
    ]);
    accMock.mockResolvedValue([]);

    const result = await getSalesMatrix("t1", period);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].id).toBe("rut:76.123.456-7");
    expect(result.rows[0].label).toBe("Empresa Demo SpA");
    expect(result.rows[0].total).toBe(300);
  });

  it("falls back to (Sin RUT receptor) bucket only when both crmAccountId and receiverRut are missing", async () => {
    const period = buildPeriod("month", new Date(2026, 4, 1));
    dteMock.mockResolvedValue([
      { id: "1", dteType: 33, date: new Date(2026, 4, 5), totalAmount: dec(119), netAmount: dec(100), crmAccountId: null, installationId: null, receiverRut: null, receiverName: null },
    ]);
    accMock.mockResolvedValue([]);

    const result = await getSalesMatrix("t1", period);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].id).toBe("__no_client__");
    expect(result.rows[0].label).toBe("(Sin RUT receptor)");
  });

  it("filters out inactive clients when onlyActiveClients is true (default)", async () => {
    const period = buildPeriod("month", new Date(2026, 4, 1));
    const acc1 = "00000000-0000-0000-0000-000000000099";
    dteMock.mockResolvedValue([
      { id: "1", dteType: 33, date: new Date(2026, 4, 5), totalAmount: dec(119), netAmount: dec(100), crmAccountId: acc1, installationId: null },
    ]);
    accMock.mockResolvedValue([
      { id: acc1, name: "Inactivo", industry: null, status: "client_inactive", installations: [] },
    ]);

    const result = await getSalesMatrix("t1", period);
    expect(result.rows).toHaveLength(0);
    expect(result.documentsCount).toBe(1); // count is from raw DTE scan, before row filtering
  });

  it("filters by sectors when provided", async () => {
    const period = buildPeriod("month", new Date(2026, 4, 1));
    const acc1 = "00000000-0000-0000-0000-000000000010";
    const acc2 = "00000000-0000-0000-0000-000000000011";
    dteMock.mockResolvedValue([
      { id: "1", dteType: 33, date: new Date(2026, 4, 5), totalAmount: dec(119), netAmount: dec(100), crmAccountId: acc1, installationId: null },
      { id: "2", dteType: 33, date: new Date(2026, 4, 6), totalAmount: dec(238), netAmount: dec(200), crmAccountId: acc2, installationId: null },
    ]);
    accMock.mockResolvedValue([
      { id: acc1, name: "Cliente A", industry: "retail", status: "client_active", installations: [] },
      { id: acc2, name: "Cliente B", industry: "financial", status: "client_active", installations: [] },
    ]);

    const result = await getSalesMatrix("t1", period, { sectors: ["financial"] });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].label).toBe("Cliente B");
  });
});
