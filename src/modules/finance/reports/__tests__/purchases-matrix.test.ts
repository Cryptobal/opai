import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    financeDte: { findMany: vi.fn() },
    financeSupplier: { findMany: vi.fn() },
    crmAccount: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { getPurchasesMatrix } from "../purchases-matrix.service";
import { buildPeriod } from "../shared/period.helper";

const dteMock = prisma.financeDte.findMany as unknown as ReturnType<typeof vi.fn>;
const supMock = prisma.financeSupplier.findMany as unknown as ReturnType<typeof vi.fn>;
const accMock = prisma.crmAccount.findMany as unknown as ReturnType<typeof vi.fn>;

const dec = (n: number) => ({ toNumber: () => n });

beforeEach(() => {
  dteMock.mockReset();
  supMock.mockReset();
  accMock.mockReset();
});

describe("getPurchasesMatrix", () => {
  it("agrupa por proveedor por default (reporte de compras)", async () => {
    const period = buildPeriod("month", new Date(2026, 7, 1));
    const supplierId = "00000000-0000-0000-0000-0000000000aa";
    dteMock.mockResolvedValue([
      {
        id: "1",
        dteType: 33,
        date: new Date(2026, 7, 5),
        netAmount: dec(100),
        crmAccountId: "client-1",
        installationId: null,
        supplierId,
        issuerRut: "76.1",
        issuerName: "Prov",
      },
    ]);
    supMock.mockResolvedValue([{ id: supplierId, name: "Proveedor X", rut: "76.1" }]);

    const result = await getPurchasesMatrix("t1", period);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.id).toBe(supplierId);
    expect(result.rows[0]!.label).toBe("Proveedor X");
    expect(accMock).not.toHaveBeenCalled();
  });

  it("agrupa por crmAccountId cuando groupBy=client", async () => {
    const period = buildPeriod("month", new Date(2026, 7, 1));
    const clientId = "00000000-0000-0000-0000-000000000001";
    dteMock.mockResolvedValue([
      {
        id: "1",
        dteType: 33,
        date: new Date(2026, 7, 5),
        netAmount: dec(400),
        crmAccountId: clientId,
        installationId: null,
        supplierId: "sup-1",
        issuerRut: "76.1",
        issuerName: "Prov",
      },
    ]);
    accMock.mockResolvedValue([{ id: clientId, name: "Cliente Uno" }]);

    const result = await getPurchasesMatrix("t1", period, {}, { groupBy: "client" });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.id).toBe(clientId);
    expect(result.rows[0]!.label).toBe("Cliente Uno");
    expect(result.rows[0]!.total).toBe(400);
    expect(supMock).not.toHaveBeenCalled();
  });
});
