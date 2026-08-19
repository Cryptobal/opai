import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../weekly-close.adapter", () => ({
  assertV3WeeksWritable: vi.fn(async () => undefined),
}));
vi.mock("@/modules/finance/cashflow/dte-date-override.service", () => ({
  upsertDteDateOverride: vi.fn(async () => undefined),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    financeDteRecurringTemplate: { findFirst: vi.fn() },
    financeCashflowScheduledDateOverride: { upsert: vi.fn(), findUnique: vi.fn() },
    financeCashflowDteDateOverride: { findUnique: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { assertV3WeeksWritable } from "../weekly-close.adapter";
import { upsertDteDateOverride } from "@/modules/finance/cashflow/dte-date-override.service";
import {
  inheritScheduledOverrideToDte,
  moveScheduledQuota,
} from "../scheduled-date-override.service";

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;
const TENANT = "t1";
const TPL = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("moveScheduledQuota", () => {
  it("persiste override de visibilidad en el lunes destino", async () => {
    asMock(prisma.financeDteRecurringTemplate.findFirst).mockResolvedValue({
      id: TPL,
      frequency: "monthly",
      dayOfMonth: 20,
      dayOfWeek: null,
      monthOfYear: null,
      startDate: new Date("2026-01-20T00:00:00.000Z"),
      endDate: null,
      lastRunAt: null,
      facturaTiming: "AL_EMITIR",
      facturaDay: null,
      facturaMesRelativo: "MISMO_MES",
    });
    asMock(prisma.financeCashflowScheduledDateOverride.upsert).mockResolvedValue({});

    const r = await moveScheduledQuota({
      tenantId: TENANT,
      templateId: TPL,
      billingPeriod: "2026-08",
      toWeek: "2026-08-24",
      createdBy: "u1",
    });
    expect(r).toEqual({
      templateId: TPL,
      billingPeriod: "2026-08",
      customDate: "2026-08-24",
    });
    expect(assertV3WeeksWritable).toHaveBeenCalledWith(TENANT, ["2026-08-24"]);
    expect(prisma.financeCashflowScheduledDateOverride.upsert).toHaveBeenCalled();
  });

  it("rechaza semana que no es lunes ISO", async () => {
    await expect(
      moveScheduledQuota({
        tenantId: TENANT,
        templateId: TPL,
        billingPeriod: "2026-08",
        toWeek: "2026-08-20",
        createdBy: "u1",
      }),
    ).rejects.toThrow(/lunes ISO/);
  });
});

describe("inheritScheduledOverrideToDte", () => {
  it("copia la semana de la P al DTE si no tenía override", async () => {
    asMock(prisma.financeCashflowScheduledDateOverride.findUnique).mockResolvedValue({
      customDate: new Date("2026-08-24T00:00:00.000Z"),
    });
    asMock(prisma.financeCashflowDteDateOverride.findUnique).mockResolvedValue(null);
    const ok = await inheritScheduledOverrideToDte({
      tenantId: TENANT,
      templateId: TPL,
      billingPeriod: "2026-08",
      dteId: "dte-1",
      createdBy: "u1",
    });
    expect(ok).toBe(true);
    expect(upsertDteDateOverride).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT,
        dteId: "dte-1",
        customDate: new Date("2026-08-24T00:00:00.000Z"),
      }),
    );
  });

  it("no pisa un override de factura ya existente", async () => {
    asMock(prisma.financeCashflowScheduledDateOverride.findUnique).mockResolvedValue({
      customDate: new Date("2026-08-24T00:00:00.000Z"),
    });
    asMock(prisma.financeCashflowDteDateOverride.findUnique).mockResolvedValue({ dteId: "dte-1" });
    const ok = await inheritScheduledOverrideToDte({
      tenantId: TENANT,
      templateId: TPL,
      billingPeriod: "2026-08",
      dteId: "dte-1",
      createdBy: "u1",
    });
    expect(ok).toBe(false);
    expect(upsertDteDateOverride).not.toHaveBeenCalled();
  });
});
