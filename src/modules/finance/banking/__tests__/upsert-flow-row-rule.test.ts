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
import { upsertFlowRowRuleForRut } from "../automatch-rule.service";

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
