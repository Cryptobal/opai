import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    financeDte: { aggregate: vi.fn(), findMany: vi.fn() },
    fxUtmRate: { findMany: vi.fn() },
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

/** Decimal-like para los montos que el servicio F29 lee con .toNumber(). */
const dec = (n: number) => ({ toNumber: () => n });

/** DTE mínimo para el servicio F29. `periodKey` YYYY-MM → fecha día 15 UTC. */
function dteDoc(
  periodKey: string,
  over: Partial<{
    direction: "ISSUED" | "RECEIVED";
    dteType: number;
    taxAmount: number;
    netAmount: number;
    receptionStatus: string | null;
  }> = {},
) {
  const [y, m] = periodKey.split("-").map(Number);
  return {
    id: `dte-${Math.random()}`,
    direction: over.direction ?? "ISSUED",
    dteType: over.dteType ?? 33,
    folio: 1,
    date: new Date(Date.UTC(y, m - 1, 15)),
    issuerRut: "1-9",
    issuerName: "Emisor",
    receiverRut: "2-7",
    receiverName: "Receptor",
    netAmount: dec(over.netAmount ?? 0),
    exemptAmount: dec(0),
    taxAmount: dec(over.taxAmount ?? 0),
    totalAmount: dec(0),
    siiStatus: "ACCEPTED",
    receptionStatus: over.receptionStatus ?? null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  (prisma.financeCashflowCategory.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
    id: "cat-iva",
  });
  (prisma.financeCashflowConfig.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
    ivaPayDay: 12,
    ppmRatePct: 0,
  });
  (prisma.financeCashflowItem.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (prisma.financeDte.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (prisma.fxUtmRate.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
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
    const key = pastPeriodKey();
    (prisma.financeDte.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      dteDoc(key, { direction: "ISSUED", dteType: 33, taxAmount: 1_000_000 }),
      dteDoc(key, { direction: "RECEIVED", dteType: 33, taxAmount: 300_000 }),
    ]);
    (prisma.financeCashflowItem.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.financeCashflowItem.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "x" });

    const r = await recomputeIvaForPeriod(TENANT, key);
    expect(r.action).toBe("created");
    const call = (prisma.financeCashflowItem.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.data.amount).toBe(700_000);
    expect(call.data.source).toBe("IVA");
    expect(call.data.recurrence).toBe("ONCE");
    expect(call.data.description).toContain("débito − crédito DTE");
  });

  it("desactiva item existente cuando net <= 0 (saldo a favor del contribuyente)", async () => {
    const key = pastPeriodKey();
    (prisma.financeDte.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      dteDoc(key, { direction: "ISSUED", dteType: 33, taxAmount: 100_000 }),
      dteDoc(key, { direction: "RECEIVED", dteType: 33, taxAmount: 500_000 }),
    ]);
    (prisma.financeCashflowItem.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "i1",
      isActive: true,
    });
    (prisma.financeCashflowItem.update as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "x" });

    const r = await recomputeIvaForPeriod(TENANT, key);
    expect(r.action).toBe("deactivated");
  });

  it("hace noop si periodKey inválido", async () => {
    const r = await recomputeIvaForPeriod(TENANT, "INVALID");
    expect(r.action).toBe("noop");
    expect(prisma.financeDte.findMany).not.toHaveBeenCalled();
  });

  it("actualiza monto cuando ya existe item", async () => {
    const key = pastPeriodKey();
    (prisma.financeDte.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      dteDoc(key, { direction: "ISSUED", dteType: 33, taxAmount: 800_000 }),
      dteDoc(key, { direction: "RECEIVED", dteType: 33, taxAmount: 100_000 }),
    ]);
    (prisma.financeCashflowItem.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "i1",
      isActive: true,
    });
    (prisma.financeCashflowItem.update as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "x" });

    const r = await recomputeIvaForPeriod(TENANT, key);
    expect(r.action).toBe("updated");
    const call = (prisma.financeCashflowItem.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.data.amount).toBe(700_000);
  });

  it("incluye NC recibidas restando crédito y PPM configurado en el total", async () => {
    // débito 1.000.000; crédito = 200.000 − 50.000 (NC recibida) = 150.000.
    // PPM 0,5% sobre neto ventas 5.000.000 = 25.000.
    // Total = 850.000 + 25.000 = 875.000.
    const key = pastPeriodKey();
    (prisma.financeCashflowConfig.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ivaPayDay: 12,
      ppmRatePct: 0.5,
    });
    (prisma.financeDte.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      dteDoc(key, {
        direction: "ISSUED",
        dteType: 33,
        taxAmount: 1_000_000,
        netAmount: 5_000_000,
      }),
      dteDoc(key, { direction: "RECEIVED", dteType: 33, taxAmount: 200_000 }),
      dteDoc(key, { direction: "RECEIVED", dteType: 61, taxAmount: 50_000 }),
      // Guía de despacho: NO debe sumar crédito.
      dteDoc(key, { direction: "RECEIVED", dteType: 52, taxAmount: 30_000 }),
    ]);
    (prisma.financeCashflowItem.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.financeCashflowItem.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "x" });

    const r = await recomputeIvaForPeriod(TENANT, key);
    expect(r.action).toBe("created");
    const call = (prisma.financeCashflowItem.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.data.amount).toBe(875_000);
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
