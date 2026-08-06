import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    financeFlowRow: { findFirst: vi.fn() },
    financeFlowCellSettlement: {
      deleteMany: vi.fn(),
      upsert: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import { loadCellSettlements, upsertCellSettlement } from "../cell-settlement.service";

const asMock = <T extends (...args: never[]) => unknown>(fn: T) =>
  fn as unknown as ReturnType<typeof vi.fn>;

describe("upsertCellSettlement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    asMock(prisma.financeFlowRow.findFirst).mockResolvedValue({ id: "row-1" });
  });

  it("AUTO borra la fila (ausencia = default)", async () => {
    asMock(prisma.financeFlowCellSettlement.deleteMany).mockResolvedValue({ count: 1 });
    const r = await upsertCellSettlement(
      "t1",
      "row-1",
      "2026-08-03",
      "AUTO",
      null,
      "u1",
    );
    expect(prisma.financeFlowCellSettlement.deleteMany).toHaveBeenCalled();
    expect(prisma.financeFlowCellSettlement.upsert).not.toHaveBeenCalled();
    expect(r.mode).toBe("AUTO");
  });

  it("CLOSED hace upsert con proyección", async () => {
    asMock(prisma.financeFlowCellSettlement.upsert).mockResolvedValue({
      mode: "CLOSED",
      closedProjectedClp: 10_000_000,
      updatedBy: "u1",
    });
    const r = await upsertCellSettlement(
      "t1",
      "row-1",
      "2026-08-03",
      "CLOSED",
      10_000_000,
      "u1",
    );
    expect(prisma.financeFlowCellSettlement.upsert).toHaveBeenCalledOnce();
    expect(r).toMatchObject({
      mode: "CLOSED",
      closedProjectedClp: 10_000_000,
    });
  });

  it("rechaza weekStart que no es lunes", async () => {
    await expect(
      upsertCellSettlement("t1", "row-1", "2026-08-04", "CLOSED", 1, null),
    ).rejects.toThrow(/lunes/i);
  });
});

describe("loadCellSettlements", () => {
  it("agrupa CLOSED por fila y semana YMD", async () => {
    asMock(prisma.financeFlowCellSettlement.findMany).mockResolvedValue([
      {
        rowId: "r1",
        weekStart: new Date("2026-08-03T00:00:00.000Z"),
        mode: "CLOSED",
      },
    ]);
    const map = await loadCellSettlements(
      "t1",
      new Date("2026-08-03T00:00:00.000Z"),
      new Date("2026-08-31T00:00:00.000Z"),
    );
    expect(map.get("r1")?.get("2026-08-03")).toBe("CLOSED");
  });
});
