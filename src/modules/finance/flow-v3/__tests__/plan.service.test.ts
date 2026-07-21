import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
    financeFlowRow: { findFirst: vi.fn() },
    financeFlowPlanCell: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import { upsertCell, bulkFill } from "../plan.service";

const TENANT = "t1";
const ROW = "row-1";
const WEEK = "2026-07-20";
const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  asMock(prisma.financeFlowRow.findFirst).mockResolvedValue({ id: ROW, archivedAt: null });
  asMock(prisma.$transaction).mockImplementation(async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[]));
});

describe("upsertCell", () => {
  it("amount 0 ⇒ delete y devuelve celda vacía leída de DB", async () => {
    asMock(prisma.financeFlowPlanCell.findFirst).mockResolvedValue(null);
    const cell = await upsertCell(TENANT, ROW, WEEK, 0, "user");
    expect(prisma.financeFlowPlanCell.deleteMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT, rowId: ROW, weekStart: new Date(`${WEEK}T00:00:00.000Z`) },
    });
    expect(prisma.financeFlowPlanCell.upsert).not.toHaveBeenCalled();
    expect(cell.amount).toBe(0);
  });

  it("read-after-write: retorna el valor de DB, no el eco del input", async () => {
    asMock(prisma.financeFlowPlanCell.upsert).mockResolvedValue({});
    asMock(prisma.financeFlowPlanCell.findFirst).mockResolvedValue({
      amount: "1500000.00",
      updatedBy: "user",
    });
    const cell = await upsertCell(TENANT, ROW, WEEK, 1_500_000, "user");
    expect(prisma.financeFlowPlanCell.upsert).toHaveBeenCalledOnce();
    expect(cell.amount).toBe(1_500_000);
    expect(cell.updatedBy).toBe("user");
  });

  it("rechaza weekStart que no sea lunes ISO", async () => {
    await expect(upsertCell(TENANT, ROW, "2026-07-21", 100, null)).rejects.toThrow(/lunes ISO/);
  });

  it("rechaza fila archivada", async () => {
    asMock(prisma.financeFlowRow.findFirst).mockResolvedValue({
      id: ROW,
      archivedAt: new Date(),
    });
    await expect(upsertCell(TENANT, ROW, WEEK, 100, null)).rejects.toThrow(/archivada/);
  });

  it("acepta montos negativos (FINANCIAMIENTO)", async () => {
    asMock(prisma.financeFlowPlanCell.upsert).mockResolvedValue({});
    asMock(prisma.financeFlowPlanCell.findFirst).mockResolvedValue({
      amount: "-2000000",
      updatedBy: null,
    });
    const cell = await upsertCell(TENANT, ROW, WEEK, -2_000_000, null);
    expect(cell.amount).toBe(-2_000_000);
  });
});

describe("bulkFill", () => {
  it("upsertea todas las semanas y relee de DB", async () => {
    asMock(prisma.financeFlowPlanCell.upsert).mockResolvedValue({});
    asMock(prisma.financeFlowPlanCell.findFirst).mockResolvedValue({
      amount: "500",
      updatedBy: "u",
    });
    const cells = await bulkFill(TENANT, ROW, ["2026-07-20", "2026-07-27"], 500, "u");
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(cells).toHaveLength(2);
    expect(cells.every((c) => c.amount === 500)).toBe(true);
  });

  it("amount 0 ⇒ deleteMany de las semanas", async () => {
    asMock(prisma.financeFlowPlanCell.findFirst).mockResolvedValue(null);
    const cells = await bulkFill(TENANT, ROW, ["2026-07-20"], 0, null);
    expect(prisma.financeFlowPlanCell.deleteMany).toHaveBeenCalledOnce();
    expect(cells[0].amount).toBe(0);
  });
});
