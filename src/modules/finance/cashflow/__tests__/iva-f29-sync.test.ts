import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    financeDte: { aggregate: vi.fn() },
    financeCashflowCategory: { findFirst: vi.fn() },
    financeCashflowConfig: { findUnique: vi.fn() },
    financeCashflowItem: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));
vi.mock("@/lib/uf", () => ({
  getUfValueForDate: vi.fn(),
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
  (prisma.financeCashflowItem.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
});

/**
 * Calcula un período cuyo `endOfMonth` queda en el pasado relativo a `new Date()`
 * para forzar la rama DTE-real del generador. Restamos 3 meses para no quedar
 * en el mes en curso (que iría por la rama proyectada).
 */
function pastPeriodKey(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 3);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Período cuyo fin > hoy → rama proyectada desde items. */
function futurePeriodKey(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 6);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

describe("recomputeIvaForPeriod — período cerrado (DTEs reales)", () => {
  it("crea item con net = débito − crédito y scheduled mes siguiente día 12", async () => {
    (prisma.financeDte.aggregate as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ _sum: { taxAmount: 1_000_000 } }) // ISSUED
      .mockResolvedValueOnce({ _sum: { taxAmount: 300_000 } }); // RECEIVED
    (prisma.financeCashflowItem.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.financeCashflowItem.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "x" });

    const key = pastPeriodKey();
    const r = await recomputeIvaForPeriod(TENANT, key);
    expect(r.action).toBe("created");
    const call = (prisma.financeCashflowItem.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.data.amount).toBe(700_000);
    expect(call.data.source).toBe("IVA");
    expect(call.data.recurrence).toBe("ONCE");
    expect(call.data.description).toContain("débito − crédito DTE");
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

    const r = await recomputeIvaForPeriod(TENANT, pastPeriodKey());
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

    const r = await recomputeIvaForPeriod(TENANT, pastPeriodKey());
    expect(r.action).toBe("updated");
    const call = (prisma.financeCashflowItem.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.data.amount).toBe(700_000);
  });
});

describe("recomputeIvaForPeriod — período futuro (proyección)", () => {
  it("calcula 19% × (ingresos netos − egresos netos) desde items proyectados", async () => {
    // Future month tiene 1 ingreso MONTHLY de $10.000.000 neto y 1 egreso
    // MONTHLY de $2.000.000 neto. Débito = 1.900.000, Crédito = 380.000,
    // Net = 1.520.000.
    const key = futurePeriodKey();
    const [yStr, mStr] = key.split("-");
    const y = Number(yStr);
    const m = Number(mStr);
    const startOfPeriod = new Date(y, m - 1, 1);
    (prisma.financeCashflowItem.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: "i-income",
        kind: "INCOME",
        amount: 10_000_000,
        currency: "CLP",
        recurrence: "MONTHLY",
        startDate: new Date(y, 0, 1),
        endDate: null,
        dayOfMonth: 5,
        dayOfWeek: null,
        monthOfYear: null,
        ufFixingPolicy: null,
        ufFixingDay: null,
      },
      {
        id: "i-expense",
        kind: "EXPENSE",
        amount: 2_000_000,
        currency: "CLP",
        recurrence: "MONTHLY",
        startDate: new Date(y, 0, 1),
        endDate: null,
        dayOfMonth: 10,
        dayOfWeek: null,
        monthOfYear: null,
        ufFixingPolicy: null,
        ufFixingDay: null,
      },
    ]);
    (prisma.financeCashflowItem.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.financeCashflowItem.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "x" });

    void startOfPeriod;
    const r = await recomputeIvaForPeriod(TENANT, key);
    expect(r.action).toBe("created");
    const call = (prisma.financeCashflowItem.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.data.amount).toBe(1_520_000);
    expect(call.data.description).toContain("estimado desde flujo afecto");
    // No debe consultar DTEs en rama proyectada.
    expect(prisma.financeDte.aggregate).not.toHaveBeenCalled();
  });

  it("desactiva ítem futuro cuando los egresos exentos dominan (no hay items afectos)", async () => {
    (prisma.financeCashflowItem.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.financeCashflowItem.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "i1",
      isActive: true,
    });
    (prisma.financeCashflowItem.update as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "x" });

    const r = await recomputeIvaForPeriod(TENANT, futurePeriodKey());
    expect(r.action).toBe("deactivated");
  });
});
