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
import { upsertCell, bulkFill, movePlanCell } from "../plan.service";

const TENANT = "t1";
const ROW = "row-1";
const WEEK = "2026-07-20";
const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  asMock(prisma.financeFlowRow.findFirst).mockResolvedValue({ id: ROW, archivedAt: null });
  // $transaction admite forma de arreglo (bulkFill) y de callback (movePlanCell).
  asMock(prisma.$transaction).mockImplementation(async (arg: unknown) =>
    typeof arg === "function"
      ? (arg as (tx: typeof prisma) => unknown)(prisma)
      : Promise.all(arg as Promise<unknown>[]),
  );
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

  it("rechaza plan nuevo hacia adelante en fila archivada", async () => {
    // Archivada la semana del 2026-07-20 (lunes). Escribir esa semana o adelante bloquea.
    asMock(prisma.financeFlowRow.findFirst).mockResolvedValue({
      id: ROW,
      archivedAt: new Date("2026-07-20T00:00:00.000Z"),
    });
    await expect(upsertCell(TENANT, ROW, "2026-07-27", 100, null)).rejects.toThrow(/archivada/);
  });

  it("permite corregir plan en semanas anteriores al término de una fila archivada", async () => {
    asMock(prisma.financeFlowRow.findFirst).mockResolvedValue({
      id: ROW,
      archivedAt: new Date("2026-07-20T00:00:00.000Z"),
    });
    asMock(prisma.financeFlowPlanCell.upsert).mockResolvedValue({});
    asMock(prisma.financeFlowPlanCell.findFirst).mockResolvedValue({ amount: "500", updatedBy: null });
    // 2026-07-13 (< cutoff 2026-07-20) sí es editable.
    const cell = await upsertCell(TENANT, ROW, "2026-07-13", 500, null);
    expect(cell.amount).toBe(500);
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

describe("movePlanCell", () => {
  const FROM = "2026-07-20";
  const TO = "2026-07-27";
  const fromMs = Date.UTC(2026, 6, 20);
  const toMs = Date.UTC(2026, 6, 27);

  const dispatch = (originAmt: string | null, destAmt: string | null) =>
    asMock(prisma.financeFlowPlanCell.findFirst).mockImplementation(
      async ({ where }: { where: { weekStart?: Date } }) => {
        const t = where.weekStart instanceof Date ? where.weekStart.getTime() : null;
        if (t === fromMs) return originAmt == null ? null : { amount: originAmt };
        if (t === toMs) return destAmt == null ? null : { amount: destAmt };
        return null;
      },
    );

  it("suma en el destino (en DB) y borra el origen, dentro de una transacción", async () => {
    dispatch("1000", "500");
    asMock(prisma.financeFlowPlanCell.upsert).mockResolvedValue({});
    await movePlanCell(TENANT, ROW, FROM, TO, "u");
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    const upsertArgs = asMock(prisma.financeFlowPlanCell.upsert).mock.calls[0][0];
    expect(upsertArgs.update.amount).toBe(1500);
    expect(prisma.financeFlowPlanCell.deleteMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT, rowId: ROW, weekStart: new Date(fromMs) },
    });
  });

  it("origen sin monto ⇒ no escribe nada", async () => {
    dispatch(null, "500");
    await movePlanCell(TENANT, ROW, FROM, TO, "u");
    expect(prisma.financeFlowPlanCell.upsert).not.toHaveBeenCalled();
    expect(prisma.financeFlowPlanCell.deleteMany).not.toHaveBeenCalled();
  });

  it("mover a la misma semana es no-op (sin transacción)", async () => {
    const r = await movePlanCell(TENANT, ROW, FROM, FROM, "u");
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(r.from.weekStart).toBe(FROM);
  });

  it("rechaza semana que no sea lunes ISO", async () => {
    await expect(movePlanCell(TENANT, ROW, FROM, "2026-07-28", "u")).rejects.toThrow(/lunes ISO/);
  });
});
