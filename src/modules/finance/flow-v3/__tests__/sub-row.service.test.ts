import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    financeSupplier: { findFirst: vi.fn() },
    financeFlowRow: { findFirst: vi.fn(), findFirstOrThrow: vi.fn() },
    financeFlowPlanRecurrence: { findFirst: vi.fn() },
  },
}));
vi.mock("../rows.service", () => ({
  createRow: vi.fn(),
  updateRow: vi.fn(),
}));
vi.mock("../recurring-plan.service", () => ({
  createRecurrence: vi.fn(),
  updateRecurrence: vi.fn(),
}));
vi.mock("@/modules/finance/banking/automatch-rule.service", () => ({
  upsertFlowRowRuleForRut: vi.fn(),
  upsertFlowRowRuleForDescription: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { createRow, updateRow } from "../rows.service";
import { createRecurrence, updateRecurrence } from "../recurring-plan.service";
import {
  upsertFlowRowRuleForDescription,
  upsertFlowRowRuleForRut,
} from "@/modules/finance/banking/automatch-rule.service";
import { createSubRow, updateSubRow } from "../sub-row.service";

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  asMock(createRow).mockResolvedValue({ id: "child-1", name: "Contador", parentId: "parent-1" });
  asMock(prisma.financeFlowRow.findFirstOrThrow).mockResolvedValue({
    id: "child-1",
    name: "Contador",
    parentId: "parent-1",
  });
  asMock(prisma.financeSupplier.findFirst).mockResolvedValue(null);
  asMock(createRecurrence).mockResolvedValue({ rule: { id: "rec-1" }, cells: [] });
  asMock(upsertFlowRowRuleForRut).mockResolvedValue({ ruleId: "rule-rut" });
  asMock(upsertFlowRowRuleForDescription).mockResolvedValue({ ruleId: "rule-glosa" });
});

describe("createSubRow", () => {
  it("crea hijo + recurrencia + reglas RUT y glosa", async () => {
    const out = await createSubRow(
      "t1",
      {
        parentId: "parent-1",
        name: "Contador",
        recurrence: {
          amount: 900_000,
          frequency: "MONTHLY",
          dayOfMonth: 5,
          startDate: "2026-08-01",
          currency: "CLP",
        },
        matchRule: { rut: "12.345.678-5", description: "CONTADOR SPA" },
      },
      "user-1",
    );

    expect(createRow).toHaveBeenCalledWith(
      "t1",
      expect.objectContaining({
        parentId: "parent-1",
        name: "Contador",
        mapping: "MANUAL",
      }),
    );
    expect(createRecurrence).toHaveBeenCalled();
    expect(upsertFlowRowRuleForRut).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "t1", flowRowId: "child-1" }),
    );
    expect(upsertFlowRowRuleForDescription).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "t1",
        flowRowId: "child-1",
        appliesTo: "WITHDRAWALS",
      }),
    );
    expect(out.ruleIds).toEqual(["rule-rut", "rule-glosa"]);
  });

  it("mapea SUPPLIER si el RUT existe en proveedores", async () => {
    asMock(prisma.financeSupplier.findFirst).mockResolvedValue({ id: "sup-1" });
    await createSubRow(
      "t1",
      {
        parentId: "parent-1",
        name: "Contador",
        matchRule: { rut: "12.345.678-5" },
      },
      null,
    );
    expect(createRow).toHaveBeenCalledWith(
      "t1",
      expect.objectContaining({ mapping: "SUPPLIER", supplierId: "sup-1" }),
    );
  });

  it("rechaza RUT inválido", async () => {
    await expect(
      createSubRow(
        "t1",
        { parentId: "parent-1", name: "X", matchRule: { rut: "12.345.678-9" } },
        null,
      ),
    ).rejects.toThrow(/RUT inválido/i);
    expect(createRow).not.toHaveBeenCalled();
  });
});

describe("updateSubRow", () => {
  it("actualiza nombre y recurrencia existente", async () => {
    asMock(prisma.financeFlowRow.findFirst).mockResolvedValue({
      id: "child-1",
      name: "Uniformes",
      parentId: "parent-1",
    });
    asMock(prisma.financeFlowPlanRecurrence.findFirst).mockResolvedValue({ id: "rec-1" });
    asMock(updateRow).mockResolvedValue({});
    asMock(updateRecurrence).mockResolvedValue({ rule: { id: "rec-1" }, cells: [] });
    asMock(prisma.financeFlowRow.findFirstOrThrow).mockResolvedValue({
      id: "child-1",
      name: "Uniformes y EPP",
      parentId: "parent-1",
    });

    const out = await updateSubRow(
      "t1",
      "child-1",
      {
        name: "Uniformes y EPP",
        recurrence: {
          amount: 700_000,
          frequency: "MONTHLY",
          dayOfMonth: 1,
          startDate: "2026-08-01",
          currency: "CLP",
        },
      },
      "user-1",
    );

    expect(updateRow).toHaveBeenCalledWith("t1", "child-1", { name: "Uniformes y EPP" });
    expect(updateRecurrence).toHaveBeenCalled();
    expect(createRecurrence).not.toHaveBeenCalled();
    expect(out.row.name).toBe("Uniformes y EPP");
  });

  it("rechaza editar una fila padre", async () => {
    asMock(prisma.financeFlowRow.findFirst).mockResolvedValue({
      id: "parent-1",
      name: "GAV",
      parentId: null,
    });
    await expect(
      updateSubRow("t1", "parent-1", { name: "X" }, null),
    ).rejects.toThrow(/subfilas/i);
  });
});
