import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../weekly-close.adapter", () => ({
  assertV3WeeksWritable: vi.fn(async () => undefined),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    financeCashflowMilestoneDateOverride: { upsert: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { assertV3WeeksWritable } from "../weekly-close.adapter";
import { moveMilestoneQuota } from "../milestone-date-override.service";

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("moveMilestoneQuota", () => {
  it("persiste override de visibilidad de la quincena", async () => {
    asMock(prisma.financeCashflowMilestoneDateOverride.upsert).mockResolvedValue({});
    const r = await moveMilestoneQuota({
      tenantId: "t1",
      milestoneKey: "quincena",
      billingPeriod: "2026-08",
      toWeek: "2026-08-24",
      createdBy: "u1",
    });
    expect(r).toEqual({
      milestoneKey: "quincena",
      billingPeriod: "2026-08",
      customDate: "2026-08-24",
    });
    expect(assertV3WeeksWritable).toHaveBeenCalledWith("t1", ["2026-08-24"]);
    expect(prisma.financeCashflowMilestoneDateOverride.upsert).toHaveBeenCalled();
  });

  it("rechaza semana que no es lunes ISO", async () => {
    await expect(
      moveMilestoneQuota({
        tenantId: "t1",
        milestoneKey: "quincena",
        billingPeriod: "2026-08",
        toWeek: "2026-08-15",
        createdBy: "u1",
      }),
    ).rejects.toThrow(/lunes ISO/);
  });

  it("acepta mover el hito iva_postergado", async () => {
    asMock(prisma.financeCashflowMilestoneDateOverride.upsert).mockResolvedValue({});
    const r = await moveMilestoneQuota({
      tenantId: "t1",
      milestoneKey: "iva_postergado",
      billingPeriod: "2026-11",
      toWeek: "2026-11-30",
      createdBy: "u1",
    });
    expect(r.milestoneKey).toBe("iva_postergado");
    expect(r.billingPeriod).toBe("2026-11");
    expect(r.customDate).toBe("2026-11-30");
  });

  it("rechaza hito desconocido", async () => {
    await expect(
      moveMilestoneQuota({
        tenantId: "t1",
        milestoneKey: "no-existe",
        billingPeriod: "2026-08",
        toWeek: "2026-08-24",
        createdBy: "u1",
      }),
    ).rejects.toThrow(/Hito/);
  });
});
