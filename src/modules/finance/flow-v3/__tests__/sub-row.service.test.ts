import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    financeSupplier: { findFirst: vi.fn() },
    financeFlowRow: { findFirstOrThrow: vi.fn() },
  },
}));
vi.mock("../rows.service", () => ({
  createRow: vi.fn(),
}));
vi.mock("../recurring-plan.service", () => ({
  createRecurrence: vi.fn(),
}));
vi.mock("@/modules/finance/banking/automatch-rule.service", () => ({
  upsertFlowRowRuleForRut: vi.fn(),
  upsertFlowRowRuleForDescription: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { createRow } from "../rows.service";
import { createRecurrence } from "../recurring-plan.service";
import {
  upsertFlowRowRuleForDescription,
  upsertFlowRowRuleForRut,
} from "@/modules/finance/banking/automatch-rule.service";
import { createSubRow } from "../sub-row.service";

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
