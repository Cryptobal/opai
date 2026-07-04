import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    opsTurnoExtra: { findMany: vi.fn() },
    opsPuestoOperativo: { findMany: vi.fn() },
    crmInstallation: { findMany: vi.fn() },
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

import { prisma } from "@/lib/prisma";
import {
  syncTurnosExtraItemForInstallation,
  recomputeTurnosExtraAmounts,
} from "../generators/turnos-extra-sync";

const TENANT = "tenant-1";
const INST = "inst-1";

beforeEach(() => {
  vi.clearAllMocks();
  (prisma.financeCashflowCategory.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
    id: "cat-te",
  });
  // Default: modo HISTORICAL (comportamiento histórico).
  (prisma.financeCashflowConfig.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
    turnosExtraMode: "HISTORICAL",
    turnosExtraPercentage: 0,
  });
});

describe("syncTurnosExtraItemForInstallation", () => {
  it("crea item semanal con amount = suma 8 semanas / 8", async () => {
    (prisma.opsTurnoExtra.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { amountClp: 80_000, installation: { name: "X" } },
      { amountClp: 80_000, installation: { name: "X" } },
      { amountClp: 80_000, installation: { name: "X" } },
      { amountClp: 80_000, installation: { name: "X" } },
    ]);
    (prisma.financeCashflowItem.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.financeCashflowItem.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "x" });

    const r = await syncTurnosExtraItemForInstallation(TENANT, INST);
    expect(r.action).toBe("created");
    const call = (prisma.financeCashflowItem.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    // total = 320_000; promedio semanal = 320_000/8 = 40_000 (el ítem se
    // proyecta SEMANALMENTE: recurrence WEEKLY, viernes, sin dayOfMonth).
    expect(call.data.amount).toBe(40_000);
    expect(call.data.source).toBe("TURNOS_EXTRA");
    expect(call.data.dayOfMonth).toBeNull();
    expect(call.data.dayOfWeek).toBe(5);
    expect(call.data.recurrence).toBe("WEEKLY");
  });

  it("hace noop si la instalación no tiene historial de TE", async () => {
    (prisma.opsTurnoExtra.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.financeCashflowItem.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const r = await syncTurnosExtraItemForInstallation(TENANT, INST);
    expect(r.action).toBe("noop");
    expect(prisma.financeCashflowItem.create).not.toHaveBeenCalled();
  });

  it("desactiva item cuando la instalación deja de tener TE", async () => {
    (prisma.opsTurnoExtra.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.financeCashflowItem.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "i1",
      isActive: true,
    });
    (prisma.financeCashflowItem.update as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "x" });
    const r = await syncTurnosExtraItemForInstallation(TENANT, INST);
    expect(r.action).toBe("deactivated");
  });
});

describe("recomputeTurnosExtraAmounts", () => {
  it("recorre todas las instalaciones del tenant + huérfanas", async () => {
    (prisma.crmInstallation.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "inst-A" },
    ]);
    (prisma.financeCashflowItem.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { sourceRefId: "inst-orphan" },
    ]);
    (prisma.opsTurnoExtra.findMany as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ where }: any) => {
        if (where.installationId === "inst-A") {
          return [{ amountClp: 100_000, installation: { name: "A" } }];
        }
        return [];
      },
    );
    (prisma.financeCashflowItem.findFirst as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ where }: any) => {
        if (where.sourceRefId === "inst-orphan") return { id: "io", isActive: true };
        return null;
      },
    );
    (prisma.financeCashflowItem.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "x" });
    (prisma.financeCashflowItem.update as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "x" });

    const stats = await recomputeTurnosExtraAmounts(TENANT);
    expect(stats.created).toBe(1);
    expect(stats.deactivated).toBe(1);
  });
});

describe("modo PCT_PAYROLL", () => {
  it("aplica el porcentaje al sueldo base de los puestos activos (semanal)", async () => {
    (prisma.financeCashflowConfig.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      turnosExtraMode: "PCT_PAYROLL",
      turnosExtraPercentage: 0.05, // 5%
    });
    (prisma.opsPuestoOperativo.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { installation: { name: "X" }, salaryStructure: { baseSalary: 1_000_000 } },
      { installation: { name: "X" }, salaryStructure: { baseSalary: 1_000_000 } },
    ]);
    (prisma.financeCashflowItem.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.financeCashflowItem.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "x" });

    const r = await syncTurnosExtraItemForInstallation(TENANT, INST);
    expect(r.action).toBe("created");
    const call = (prisma.financeCashflowItem.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    // 2 * 1.000.000 sueldo base = 2.000.000; 5% = 100.000 mensual;
    // semanal = round(100.000 / 4.33) = 23.095.
    expect(call.data.amount).toBe(23_095);
    expect(call.data.description).toContain("5.0%");
  });

  it("no proyecta nada si pct=0", async () => {
    (prisma.financeCashflowConfig.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      turnosExtraMode: "PCT_PAYROLL",
      turnosExtraPercentage: 0,
    });
    (prisma.opsPuestoOperativo.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { installation: { name: "X" }, salaryStructure: { baseSalary: 500_000 } },
    ]);
    (prisma.financeCashflowItem.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const r = await syncTurnosExtraItemForInstallation(TENANT, INST);
    expect(r.action).toBe("noop");
    expect(prisma.financeCashflowItem.create).not.toHaveBeenCalled();
  });
});
