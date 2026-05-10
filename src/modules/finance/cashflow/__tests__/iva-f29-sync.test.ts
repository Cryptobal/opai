import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    financeDte: { aggregate: vi.fn() },
    financeCashflowCategory: { findFirst: vi.fn() },
    financeCashflowConfig: { findUnique: vi.fn() },
    financeCashflowItem: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import { recomputeIvaForPeriod } from "../generators/iva-f29-sync";

const TENANT = "tenant-1";

beforeEach(() => {
  vi.clearAllMocks();
  (prisma.financeCashflowCategory.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
    id: "cat-iva",
  });
  (prisma.financeCashflowConfig.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
    ivaPayDay: 12,
  });
});

describe("recomputeIvaForPeriod", () => {
  it("crea item con net = débito − crédito y scheduled = mes siguiente día 12", async () => {
    (prisma.financeDte.aggregate as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ _sum: { taxAmount: 1_000_000 } }) // ISSUED
      .mockResolvedValueOnce({ _sum: { taxAmount: 300_000 } }); // RECEIVED
    (prisma.financeCashflowItem.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.financeCashflowItem.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "x" });

    const r = await recomputeIvaForPeriod(TENANT, "2026-04");
    expect(r.action).toBe("created");
    const call = (prisma.financeCashflowItem.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.data.amount).toBe(700_000);
    expect(call.data.source).toBe("IVA");
    expect(call.data.recurrence).toBe("ONCE");
    const sched = call.data.startDate as Date;
    expect(sched.getFullYear()).toBe(2026);
    expect(sched.getMonth()).toBe(4); // mayo (0-indexed)
    expect(sched.getDate()).toBe(12);
  });

  it("desactiva item existente cuando net <= 0 (saldo a favor del contribuyente)", async () => {
    (prisma.financeDte.aggregate as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ _sum: { taxAmount: 100_000 } })
      .mockResolvedValueOnce({ _sum: { taxAmount: 500_000 } });
    (prisma.financeCashflowItem.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "i1",
      isActive: true,
    });
    (prisma.financeCashflowItem.update as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "x" });

    const r = await recomputeIvaForPeriod(TENANT, "2026-04");
    expect(r.action).toBe("deactivated");
  });

  it("hace noop si periodKey inválido", async () => {
    const r = await recomputeIvaForPeriod(TENANT, "INVALID");
    expect(r.action).toBe("noop");
    expect(prisma.financeDte.aggregate).not.toHaveBeenCalled();
  });

  it("actualiza monto cuando ya existe item", async () => {
    (prisma.financeDte.aggregate as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ _sum: { taxAmount: 800_000 } })
      .mockResolvedValueOnce({ _sum: { taxAmount: 100_000 } });
    (prisma.financeCashflowItem.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "i1",
      isActive: true,
    });
    (prisma.financeCashflowItem.update as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "x" });

    const r = await recomputeIvaForPeriod(TENANT, "2026-04");
    expect(r.action).toBe("updated");
    const call = (prisma.financeCashflowItem.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.data.amount).toBe(700_000);
  });
});
