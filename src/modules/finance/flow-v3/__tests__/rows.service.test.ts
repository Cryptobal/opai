import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
    crmAccount: { findFirst: vi.fn() },
    crmInstallation: { findFirst: vi.fn() },
    financeCashflowCategory: { findFirst: vi.fn() },
    financeSupplier: { findFirst: vi.fn() },
    financeDteRecurringTemplate: { findMany: vi.fn() },
    financeFlowRow: {
      findFirst: vi.fn(),
      findFirstOrThrow: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import { createRow, archiveRow } from "../rows.service";

const TENANT = "t1";
const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
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
