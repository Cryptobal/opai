import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    financeFlowRow: { findFirst: vi.fn() },
    financeAutoMatchRule: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  upsertFlowRowRuleForDescription,
  upsertFlowRowRuleForRut,
} from "../automatch-rule.service";

const TENANT = "t1";
const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  asMock(prisma.financeFlowRow.findFirst).mockResolvedValue({ id: "row-1" });
  asMock(prisma.financeAutoMatchRule.findMany).mockResolvedValue([]);
  asMock(prisma.financeAutoMatchRule.create).mockResolvedValue({ id: "rule-new" });
  asMock(prisma.financeAutoMatchRule.update).mockResolvedValue({ id: "rule-existing" });
});

describe("upsertFlowRowRuleForRut", () => {
  it("crea regla nueva cuando no existe", async () => {
    const out = await upsertFlowRowRuleForRut({
      tenantId: TENANT,
      rut: "12.345.678-5",
      flowRowId: "row-1",
      rowName: "Proveedor X",
      userId: "user-1",
    });
    expect(out.created).toBe(true);
    expect(out.ruleId).toBe("rule-new");
    expect(prisma.financeAutoMatchRule.create).toHaveBeenCalledOnce();
  });

  it("actualiza regla existente con mismo RUT (idempotente)", async () => {
    asMock(prisma.financeAutoMatchRule.findMany).mockResolvedValue([
      {
        id: "rule-existing",
        conditions: {
          mode: "ALL",
          items: [
            {
              field: "BENEFICIARY_RUT",
              operator: "RUT_MATCHES",
              value: "123456785",
            },
          ],
        },
      },
    ]);

    const out = await upsertFlowRowRuleForRut({
      tenantId: TENANT,
      rut: "123456785",
      flowRowId: "row-2",
      rowName: "Otra fila",
      userId: "user-1",
    });

    expect(out.created).toBe(false);
    expect(out.ruleId).toBe("rule-existing");
    expect(prisma.financeAutoMatchRule.update).toHaveBeenCalledOnce();
    expect(prisma.financeAutoMatchRule.create).not.toHaveBeenCalled();
  });

  it("rechaza fila de otro tenant", async () => {
    asMock(prisma.financeFlowRow.findFirst).mockResolvedValue(null);
    await expect(
      upsertFlowRowRuleForRut({
        tenantId: TENANT,
        rut: "123456785",
        flowRowId: "row-x",
        rowName: "X",
        userId: null,
      }),
    ).rejects.toThrow(/Fila de flujo no encontrada/);
  });
});

describe("upsertFlowRowRuleForDescription", () => {
  it("crea regla DESCRIPTION CONTAINS con prioridad 60", async () => {
    const out = await upsertFlowRowRuleForDescription({
      tenantId: TENANT,
      needle: "vercel",
      flowRowId: "row-1",
      rowName: "Sistemas",
      appliesTo: "WITHDRAWALS",
      userId: "user-1",
    });
    expect(out.created).toBe(true);
    expect(out.ruleId).toBe("rule-new");
    expect(prisma.financeAutoMatchRule.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          priority: 60,
          appliesTo: "WITHDRAWALS",
          name: "Glosa «VERCEL» → Sistemas",
        }),
      }),
    );
  });

  it("actualiza regla existente con mismo needle y appliesTo", async () => {
    asMock(prisma.financeAutoMatchRule.findMany).mockResolvedValue([
      {
        id: "rule-existing",
        appliesTo: "WITHDRAWALS",
        conditions: {
          mode: "ALL",
          items: [
            { field: "DESCRIPTION", operator: "CONTAINS", value: "VERCEL" },
          ],
        },
      },
    ]);

    const out = await upsertFlowRowRuleForDescription({
      tenantId: TENANT,
      needle: "VERCEL",
      flowRowId: "row-1",
      rowName: "Sistemas",
      appliesTo: "WITHDRAWALS",
      userId: "user-1",
    });

    expect(out.created).toBe(false);
    expect(out.ruleId).toBe("rule-existing");
    expect(prisma.financeAutoMatchRule.update).toHaveBeenCalledOnce();
    expect(prisma.financeAutoMatchRule.create).not.toHaveBeenCalled();
  });

  it("rechaza needle corto", async () => {
    await expect(
      upsertFlowRowRuleForDescription({
        tenantId: TENANT,
        needle: "AB",
        flowRowId: "row-1",
        rowName: "Sistemas",
        appliesTo: "WITHDRAWALS",
        userId: null,
      }),
    ).rejects.toThrow(/al menos 4/);
  });

  it("rechaza needle prohibido", async () => {
    await expect(
      upsertFlowRowRuleForDescription({
        tenantId: TENANT,
        needle: "COMPRA",
        flowRowId: "row-1",
        rowName: "Sistemas",
        appliesTo: "WITHDRAWALS",
        userId: null,
      }),
    ).rejects.toThrow(/genérico/);
  });
});
