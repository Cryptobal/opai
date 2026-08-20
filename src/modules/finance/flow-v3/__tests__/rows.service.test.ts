import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../load-committed-income", () => ({
  loadCommittedIncome: vi.fn(async () => ({ committed: new Map(), excluded: [] })),
}));
vi.mock("../load-committed-expense", () => ({ loadCommittedExpense: vi.fn(async () => new Map()) }));
vi.mock("../load-real", () => ({ loadReal: vi.fn(async () => new Map()) }));
vi.mock("../weekly-close.adapter", () => ({
  listClosedV3Weeks: vi.fn(async () => []),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
    crmAccount: { findFirst: vi.fn() },
    crmInstallation: { findFirst: vi.fn() },
    financeCashflowCategory: { findFirst: vi.fn() },
    financeSupplier: { findFirst: vi.fn() },
    financeDteRecurringTemplate: { findMany: vi.fn() },
    financeFlowPlanCell: { count: vi.fn(), findMany: vi.fn() },
    financeFlowRow: {
      findFirst: vi.fn(),
      findFirstOrThrow: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import { loadCommittedIncome } from "../load-committed-income";
import { loadReal } from "../load-real";
import { listClosedV3Weeks } from "../weekly-close.adapter";
import { createRow, archiveRow, deleteRow, updateRow } from "../rows.service";

const TENANT = "t1";
const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  asMock(prisma.financeFlowPlanCell.findMany).mockResolvedValue([]);
  asMock(listClosedV3Weeks).mockResolvedValue([]);
});

describe("createRow", () => {
  it("ACCOUNT_INSTALLATION valida cuenta+instalación del tenant", async () => {
    asMock(prisma.crmAccount.findFirst).mockResolvedValue({ id: "acc-1" });
    asMock(prisma.crmInstallation.findFirst).mockResolvedValue({ id: "inst-1" });
    asMock(prisma.financeFlowRow.findFirst).mockResolvedValue({ orderIndex: 3 });
    asMock(prisma.financeFlowRow.create).mockResolvedValue({ id: "row-1" });
    asMock(prisma.financeFlowRow.findFirstOrThrow).mockResolvedValue({ id: "row-1", name: "Cliente X" });

    const row = await createRow(TENANT, {
      section: "INGRESOS",
      name: "Cliente X",
      mapping: "ACCOUNT_INSTALLATION",
      crmAccountId: "acc-1",
      installationId: "inst-1",
    });
    expect(row.id).toBe("row-1");
    const data = asMock(prisma.financeFlowRow.create).mock.calls[0][0].data;
    expect(data.orderIndex).toBe(4);
    expect(data.crmAccountId).toBe("acc-1");
    expect(data.categoryId).toBeNull();
  });

  it("rechaza cuenta inexistente", async () => {
    asMock(prisma.crmAccount.findFirst).mockResolvedValue(null);
    await expect(
      createRow(TENANT, {
        section: "INGRESOS",
        name: "X",
        mapping: "ACCOUNT_INSTALLATION",
        crmAccountId: "no-existe",
      }),
    ).rejects.toThrow(/Cuenta CRM/);
  });

  it("MANUAL no exige referencias", async () => {
    asMock(prisma.financeFlowRow.findFirst).mockResolvedValue(null);
    asMock(prisma.financeFlowRow.create).mockResolvedValue({ id: "row-2" });
    asMock(prisma.financeFlowRow.findFirstOrThrow).mockResolvedValue({ id: "row-2" });
    const row = await createRow(TENANT, {
      section: "GAV",
      name: "Arriendo oficina",
      mapping: "MANUAL",
    });
    expect(row.id).toBe("row-2");
    expect(asMock(prisma.financeFlowRow.create).mock.calls[0][0].data.orderIndex).toBe(0);
  });

  it("crea subfila bajo un padre GAV", async () => {
    asMock(prisma.financeFlowRow.findFirst)
      .mockResolvedValueOnce({
        id: "parent-1",
        section: "GAV",
        parentId: null,
        canonicalKey: null,
        archivedAt: null,
      })
      .mockResolvedValueOnce({ orderIndex: 1 });
    asMock(prisma.financeFlowRow.create).mockResolvedValue({ id: "child-1" });
    asMock(prisma.financeFlowRow.findFirstOrThrow).mockResolvedValue({ id: "child-1", parentId: "parent-1" });

    const row = await createRow(TENANT, {
      section: "GAV",
      name: "Contador",
      mapping: "MANUAL",
      parentId: "parent-1",
    });
    expect(row.id).toBe("child-1");
    const data = asMock(prisma.financeFlowRow.create).mock.calls[0][0].data;
    expect(data.parentId).toBe("parent-1");
    expect(data.section).toBe("GAV");
    expect(data.orderIndex).toBe(2);
  });

  it("rechaza subfila si el padre ya es hijo", async () => {
    asMock(prisma.financeFlowRow.findFirst).mockResolvedValue({
      id: "child-1",
      section: "GAV",
      parentId: "parent-1",
      canonicalKey: null,
      archivedAt: null,
    });
    await expect(
      createRow(TENANT, {
        section: "GAV",
        name: "Nieto",
        mapping: "MANUAL",
        parentId: "child-1",
      }),
    ).rejects.toThrow(/un nivel/i);
  });

  it("rechaza subfila en bandeja / sistema", async () => {
    asMock(prisma.financeFlowRow.findFirst).mockResolvedValue({
      id: "bandeja",
      section: "GAV",
      parentId: null,
      canonicalKey: "BANDEJA_EGRESO",
      archivedAt: null,
    });
    await expect(
      createRow(TENANT, {
        section: "GAV",
        name: "X",
        mapping: "MANUAL",
        parentId: "bandeja",
      }),
    ).rejects.toThrow(/sistema/i);
  });
});

describe("archiveRow", () => {
  it("devuelve warning si hay programación activa para la cuenta/instalación", async () => {
    asMock(prisma.financeFlowRow.findFirst).mockResolvedValue({
      id: "row-1",
      mapping: "ACCOUNT_INSTALLATION",
      crmAccountId: "acc-1",
      installationId: "inst-1",
    });
    asMock(prisma.financeDteRecurringTemplate.findMany).mockResolvedValue([{ id: "tpl-9" }]);
    asMock(prisma.financeFlowRow.update).mockResolvedValue({});
    asMock(prisma.financeFlowRow.findFirstOrThrow).mockResolvedValue({
      id: "row-1",
      archivedAt: new Date(),
    });

    const res = await archiveRow(TENANT, "row-1");
    expect(res.warning).toEqual({ activeRecurringTemplateIds: ["tpl-9"] });
    expect(prisma.financeFlowRow.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ archivedAt: expect.any(Date) }) }),
    );
  });

  it("sin programación activa → warning null y archiva igual", async () => {
    asMock(prisma.financeFlowRow.findFirst).mockResolvedValue({
      id: "row-2",
      mapping: "MANUAL",
      crmAccountId: null,
      installationId: null,
    });
    asMock(prisma.financeFlowRow.update).mockResolvedValue({});
    asMock(prisma.financeFlowRow.findFirstOrThrow).mockResolvedValue({ id: "row-2" });
    const res = await archiveRow(TENANT, "row-2");
    expect(res.warning).toBeNull();
  });
});

describe("deleteRow", () => {
  const cleanRow = {
    id: "row-1", tenantId: TENANT, name: "X", section: "GAV", mapping: "MANUAL",
    crmAccountId: null, installationId: null, categoryId: null, supplierId: null,
  };

  it("409 (archívala) si la fila tiene plan histórico", async () => {
    asMock(prisma.financeFlowRow.findFirst).mockResolvedValue(cleanRow);
    asMock(prisma.financeFlowRow.count).mockResolvedValue(0);
    asMock(prisma.financeFlowPlanCell.count).mockResolvedValue(3);
    await expect(deleteRow(TENANT, "row-1")).rejects.toThrow(/archívala/i);
    expect(prisma.financeFlowRow.delete).not.toHaveBeenCalled();
  });

  it("409 (archívala) si la fila muestra comprometido/real", async () => {
    asMock(prisma.financeFlowRow.findFirst).mockResolvedValue(cleanRow);
    asMock(prisma.financeFlowRow.count).mockResolvedValue(0);
    asMock(prisma.financeFlowPlanCell.count).mockResolvedValue(0);
    asMock(loadCommittedIncome).mockResolvedValueOnce({
      committed: new Map([["row-1", new Map([["2026-07-20", { total: 100 }]])]]),
      excluded: [],
    });
    await expect(deleteRow(TENANT, "row-1")).rejects.toThrow(/archívala/i);
    expect(prisma.financeFlowRow.delete).not.toHaveBeenCalled();
  });

  it("elimina una fila sin plan ni comprometido ni real", async () => {
    asMock(prisma.financeFlowRow.findFirst).mockResolvedValue(cleanRow);
    asMock(prisma.financeFlowRow.count).mockResolvedValue(0);
    asMock(prisma.financeFlowPlanCell.count).mockResolvedValue(0);
    asMock(prisma.financeFlowRow.delete).mockResolvedValue({});
    const res = await deleteRow(TENANT, "row-1");
    expect(res).toEqual({ deleted: true });
    expect(prisma.financeFlowRow.delete).toHaveBeenCalledWith({ where: { id: "row-1" } });
  });

  it("rechaza eliminar un padre con subfilas", async () => {
    asMock(prisma.financeFlowRow.findFirst).mockResolvedValue(cleanRow);
    asMock(prisma.financeFlowRow.count).mockResolvedValue(2);
    await expect(deleteRow(TENANT, "row-1")).rejects.toThrow(/subfilas/i);
    expect(prisma.financeFlowRow.delete).not.toHaveBeenCalled();
  });

  it("elimina una subfila con plan en semanas abiertas", async () => {
    asMock(prisma.financeFlowRow.findFirst).mockResolvedValue({
      ...cleanRow, id: "child-1", parentId: "parent-1",
    });
    asMock(prisma.financeFlowRow.count).mockResolvedValue(0);
    asMock(prisma.financeFlowPlanCell.findMany).mockResolvedValue([
      { weekStart: new Date("2026-08-10T00:00:00Z") },
    ]);
    asMock(prisma.financeFlowRow.delete).mockResolvedValue({});
    const res = await deleteRow(TENANT, "child-1");
    expect(res).toEqual({ deleted: true });
    expect(prisma.financeFlowRow.delete).toHaveBeenCalledWith({ where: { id: "child-1" } });
  });

  it("409 si la subfila tiene plan en una semana cerrada", async () => {
    asMock(prisma.financeFlowRow.findFirst).mockResolvedValue({
      ...cleanRow, id: "child-1", parentId: "parent-1",
    });
    asMock(prisma.financeFlowRow.count).mockResolvedValue(0);
    asMock(prisma.financeFlowPlanCell.findMany).mockResolvedValue([
      { weekStart: new Date("2026-08-03T00:00:00Z") },
    ]);
    asMock(listClosedV3Weeks).mockResolvedValue(["2026-08-03"]);
    await expect(deleteRow(TENANT, "child-1")).rejects.toThrow(/semanas cerradas/i);
    expect(prisma.financeFlowRow.delete).not.toHaveBeenCalled();
  });
});

describe("updateRow MANUAL → CATEGORY", () => {
  it("asigna categoría y pasa mapping a CATEGORY", async () => {
    asMock(prisma.financeFlowRow.findFirst).mockResolvedValue({
      id: "row-1",
      mapping: "MANUAL",
      section: "FINANCIAMIENTO",
      categoryId: null,
      name: "Retiro socios",
    });
    asMock(prisma.financeCashflowCategory.findFirst).mockResolvedValue({
      id: "cat-retiro",
    });
    asMock(prisma.financeFlowRow.update).mockResolvedValue({});
    asMock(prisma.financeFlowRow.findFirstOrThrow).mockResolvedValue({
      id: "row-1",
      mapping: "CATEGORY",
      categoryId: "cat-retiro",
    });

    await updateRow(TENANT, "row-1", {
      categoryId: "cat-retiro",
      mapping: "CATEGORY",
    });

    expect(prisma.financeFlowRow.update).toHaveBeenCalledWith({
      where: { id: "row-1" },
      data: expect.objectContaining({
        categoryId: "cat-retiro",
        mapping: "ACCOUNTS",
      }),
    });
  });

  it("rechaza CATEGORY → MANUAL si hay actividad derivada", async () => {
    asMock(prisma.financeFlowRow.findFirst).mockResolvedValue({
      id: "row-1",
      mapping: "CATEGORY",
      section: "GAV",
      categoryId: "cat-1",
      name: "Telefonía",
      crmAccountId: null,
      installationId: null,
      recurringTemplateId: null,
      supplierId: null,
    });
    asMock(loadReal).mockResolvedValueOnce(
      new Map([["row-1", new Map([["2026-07-20", { total: 5000 }]])]]),
    );

    await expect(
      updateRow(TENANT, "row-1", { mapping: "MANUAL" }),
    ).rejects.toThrow(/movimientos reales/);
  });
});
