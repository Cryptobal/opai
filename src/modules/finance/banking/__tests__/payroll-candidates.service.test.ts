import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    payrollLiquidacion: { findMany: vi.fn() },
    payrollAnticipoItem: { findMany: vi.fn() },
    opsGuardEvent: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { loadPayrollCandidates } from "../payroll-candidates.service";

const TENANT = "t1";
const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  asMock(prisma.payrollLiquidacion.findMany).mockResolvedValue([]);
  asMock(prisma.payrollAnticipoItem.findMany).mockResolvedValue([]);
  asMock(prisma.opsGuardEvent.findMany).mockResolvedValue([]);
});

describe("loadPayrollCandidates", () => {
  it("devuelve mapa vacío si no hay guardiaIds", async () => {
    const map = await loadPayrollCandidates(TENANT, [], 90);
    expect(map.size).toBe(0);
    expect(prisma.payrollLiquidacion.findMany).not.toHaveBeenCalled();
  });

  it("agrega liquidación APPROVED sin paidAt", async () => {
    asMock(prisma.payrollLiquidacion.findMany).mockResolvedValue([
      {
        id: "liq1",
        guardiaId: "g1",
        netSalary: 450000,
        period: { year: 2026, month: 7 },
      },
    ]);

    const map = await loadPayrollCandidates(TENANT, ["g1"], 120);
    expect(map.get("g1")).toEqual([
      {
        kind: "LIQUIDACION",
        guardiaId: "g1",
        amount: 450000,
        label: "Liquidación jul-26",
        refId: "liq1",
      },
    ]);
    expect(prisma.payrollLiquidacion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: TENANT,
          guardiaId: { in: ["g1"] },
          status: "APPROVED",
          paidAt: null,
        }),
      }),
    );
  });

  it("agrega anticipo PENDING con tenant vía process", async () => {
    asMock(prisma.payrollAnticipoItem.findMany).mockResolvedValue([
      {
        id: "ant1",
        guardiaId: "g1",
        amount: 200000,
        anticipoProcess: { period: { year: 2026, month: 7 } },
      },
    ]);

    const map = await loadPayrollCandidates(TENANT, ["g1"], 90);
    expect(map.get("g1")).toEqual([
      {
        kind: "ANTICIPO",
        guardiaId: "g1",
        amount: 200000,
        label: "Anticipo jul-26",
        refId: "ant1",
      },
    ]);
    expect(prisma.payrollAnticipoItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "PENDING",
          anticipoProcess: { tenantId: TENANT },
        }),
      }),
    );
  });

  it("agrega finiquito approved en ventana −30/+90", async () => {
    asMock(prisma.opsGuardEvent.findMany).mockResolvedValue([
      {
        id: "fin1",
        guardiaId: "g2",
        finiquitoDate: new Date("2026-07-31T00:00:00.000Z"),
        totalSettlementAmount: 1500000,
      },
    ]);

    const map = await loadPayrollCandidates(TENANT, ["g1", "g2"], 90);
    expect(map.get("g1")).toEqual([]);
    expect(map.get("g2")).toEqual([
      {
        kind: "FINIQUITO",
        guardiaId: "g2",
        amount: 1500000,
        label: "Finiquito 31/07/26",
        refId: "fin1",
      },
    ]);
    expect(prisma.opsGuardEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: TENANT,
          category: "finiquito",
          status: "approved",
          finiquitoDate: expect.objectContaining({
            gte: expect.any(Date),
            lte: expect.any(Date),
          }),
        }),
      }),
    );
  });

  it("tres queries batch en paralelo (una por tipo)", async () => {
    await loadPayrollCandidates(TENANT, ["g1", "g2"], 60);
    expect(prisma.payrollLiquidacion.findMany).toHaveBeenCalledOnce();
    expect(prisma.payrollAnticipoItem.findMany).toHaveBeenCalledOnce();
    expect(prisma.opsGuardEvent.findMany).toHaveBeenCalledOnce();
  });
});
