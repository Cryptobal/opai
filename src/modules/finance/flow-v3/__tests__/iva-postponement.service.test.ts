import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../weekly-close.adapter", () => ({
  assertV3WeeksWritable: vi.fn(async () => undefined),
}));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => undefined) }));
vi.mock("@/lib/fx-date", () => ({ todayChileStr: () => "2026-08-20" }));
vi.mock("@/modules/finance/billing/f29.service", () => ({
  computeF29Period: vi.fn(),
}));
vi.mock("../load-committed-expense-params", () => ({
  computeProjectedF29ForPeriod: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    financeCashflowConfig: { findUnique: vi.fn() },
    financeIvaPostponement: { upsert: vi.fn(), findUnique: vi.fn(), delete: vi.fn() },
    financeCashflowMilestoneDateOverride: { deleteMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { prisma } from "@/lib/prisma";
import { assertV3WeeksWritable } from "../weekly-close.adapter";
import { computeProjectedF29ForPeriod } from "../load-committed-expense-params";
import { postponeIva, undoIvaPostponement } from "../iva-postponement.service";

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  asMock(prisma.financeCashflowConfig.findUnique).mockResolvedValue({
    ivaPayDay: 12,
    ivaPostponedPayDay: 20,
    ppmRatePct: 0,
  });
});

describe("postponeIva", () => {
  it("rechaza un período sin IVA determinado", async () => {
    asMock(computeProjectedF29ForPeriod).mockResolvedValue({
      total: 80_000,
      ivaDeterminado: -10_000,
      debito: 0,
      credito: 10_000,
      ppm: 80_000,
      clamped: false,
    });
    await expect(
      postponeIva({ tenantId: "t1", taxPeriod: "2026-08", createdBy: "u1" }),
    ).rejects.toThrow(/No hay IVA determinado/);
    expect(prisma.financeIvaPostponement.upsert).not.toHaveBeenCalled();
  });

  it("upsert y exige semanas escribibles", async () => {
    asMock(computeProjectedF29ForPeriod).mockResolvedValue({
      total: 2_500_000,
      ivaDeterminado: 2_200_000,
      debito: 2_200_000,
      credito: 0,
      ppm: 300_000,
      clamped: false,
    });
    asMock(prisma.financeIvaPostponement.upsert).mockResolvedValue({});
    const r = await postponeIva({ tenantId: "t1", taxPeriod: "2026-08", createdBy: "u1" });
    expect(r).toEqual({
      taxPeriod: "2026-08",
      originalPayDate: "2026-09-12",
      postponedPayDate: "2026-11-20",
      deferredAmountClp: 2_200_000,
    });
    expect(assertV3WeeksWritable).toHaveBeenCalledWith("t1", ["2026-09-07", "2026-11-16"]);
  });
});

describe("undoIvaPostponement", () => {
  it("borra el registro y el override del hito postergado", async () => {
    asMock(prisma.financeIvaPostponement.findUnique).mockResolvedValue({
      taxPeriod: "2026-08",
      originalPayDate: new Date("2026-09-12T00:00:00.000Z"),
      postponedPayDate: new Date("2026-11-20T00:00:00.000Z"),
    });
    asMock(prisma.$transaction).mockResolvedValue([]);
    await undoIvaPostponement({ tenantId: "t1", taxPeriod: "2026-08", userId: "u1" });
    expect(assertV3WeeksWritable).toHaveBeenCalledWith("t1", ["2026-09-07", "2026-11-16"]);
    expect(prisma.$transaction).toHaveBeenCalled();
  });
});
