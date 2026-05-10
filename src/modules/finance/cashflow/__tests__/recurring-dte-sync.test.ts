import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    financeDteRecurringTemplate: { findFirst: vi.fn(), findMany: vi.fn() },
    financeCashflowCategory: { findFirst: vi.fn() },
    financeCashflowItem: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  syncRecurringDteItem,
  backfillRecurringDteItems,
} from "../generators/recurring-dte-sync";

const TENANT = "tenant-1";

function makeTpl(overrides: Record<string, unknown> = {}) {
  return {
    id: "tpl-1",
    tenantId: TENANT,
    name: "Plan Premium",
    receiverName: "Cliente A",
    currency: "CLP",
    lines: [{ quantity: 1, unitPrice: 100_000, discountPct: 0 }],
    frequency: "monthly",
    dayOfMonth: 5,
    dayOfWeek: null,
    monthOfYear: null,
    startDate: new Date("2026-01-01"),
    endDate: null,
    ufFixingPolicy: null,
    ufFixingDay: null,
    installationId: null,
    crmAccountId: "acc-1",
    isActive: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  (prisma.financeCashflowCategory.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
    id: "cat-ventas",
  });
});

describe("syncRecurringDteItem", () => {
  it("crea item con monto = subtotal × 1.19", async () => {
    (prisma.financeDteRecurringTemplate.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeTpl(),
    );
    (prisma.financeCashflowItem.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.financeCashflowItem.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "x" });

    const r = await syncRecurringDteItem(TENANT, "tpl-1");
    expect(r.action).toBe("created");
    const call = (prisma.financeCashflowItem.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.data.amount).toBe(119_000);
    expect(call.data.source).toBe("RECURRING_DTE");
    expect(call.data.sourceRefId).toBe("tpl-1");
    expect(call.data.kind).toBe("INCOME");
    expect(call.data.recurrence).toBe("MONTHLY");
    expect(call.data.dayOfMonth).toBe(5);
  });

  it("frequency=weekly mapea a recurrence=WEEKLY con dayOfWeek", async () => {
    (prisma.financeDteRecurringTemplate.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeTpl({ frequency: "weekly", dayOfWeek: 3, dayOfMonth: null }),
    );
    (prisma.financeCashflowItem.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.financeCashflowItem.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "x" });

    await syncRecurringDteItem(TENANT, "tpl-1");
    const call = (prisma.financeCashflowItem.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.data.recurrence).toBe("WEEKLY");
    expect(call.data.dayOfWeek).toBe(3);
    expect(call.data.dayOfMonth).toBeNull();
  });

  it("desactiva item cuando template pasa a isActive=false", async () => {
    (prisma.financeDteRecurringTemplate.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeTpl({ isActive: false }),
    );
    (prisma.financeCashflowItem.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "i1",
      isActive: true,
    });
    (prisma.financeCashflowItem.update as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "x" });

    const r = await syncRecurringDteItem(TENANT, "tpl-1");
    expect(r.action).toBe("deactivated");
  });

  it("multi-tenant safety: template de otro tenant → noop", async () => {
    (prisma.financeDteRecurringTemplate.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const r = await syncRecurringDteItem("tenant-other", "tpl-1");
    expect(r.action).toBe("noop");
    expect(prisma.financeCashflowItem.create).not.toHaveBeenCalled();
  });
});

describe("backfillRecurringDteItems", () => {
  it("recorre todos los templates del tenant", async () => {
    (prisma.financeDteRecurringTemplate.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "t1" },
      { id: "t2" },
    ]);
    (prisma.financeDteRecurringTemplate.findFirst as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ where }: any) => makeTpl({ id: where.id }),
    );
    (prisma.financeCashflowItem.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.financeCashflowItem.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "x" });

    const stats = await backfillRecurringDteItems(TENANT);
    expect(stats.created).toBe(2);
  });
});
