import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../config.service", () => ({
  getOrCreateCashflowConfig: vi.fn(),
}));
vi.mock("../assign-projection-resolver", () => ({
  resolveConsumableProjection: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    financeBankTransaction: { findFirst: vi.fn(), update: vi.fn() },
    financeCashflowOccurrence: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    financeCashflowItem: { create: vi.fn(), delete: vi.fn() },
    financeCashflowCategory: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { prisma } from "@/lib/prisma";
import { getOrCreateCashflowConfig } from "../config.service";
import { resolveConsumableProjection } from "../assign-projection-resolver";
import {
  assignBankTxToCategory,
  revertBankTxCategoryAssignment,
} from "../assign-to-category.service";

type Fn = ReturnType<typeof vi.fn>;
const TENANT = "tenant-1";
const USER = "user-1";
const num = (d: unknown) => Number(d);

beforeEach(() => {
  vi.clearAllMocks();
  (getOrCreateCashflowConfig as Fn).mockResolvedValue({ weekClosingDow: 5 });
  // $transaction ejecuta el callback con el mismo cliente mockeado.
  (prisma.$transaction as Fn).mockImplementation(async (cb: (db: unknown) => unknown) =>
    cb(prisma),
  );
  (prisma.financeCashflowOccurrence.create as Fn).mockImplementation(async (a: { data: unknown }) => ({
    id: "occ-new",
    ...(a.data as object),
  }));
  (prisma.financeCashflowOccurrence.update as Fn).mockImplementation(async () => ({ id: "occ-mat" }));
  (prisma.financeCashflowItem.create as Fn).mockResolvedValue({ id: "item-new" });
  (prisma.financeBankTransaction.update as Fn).mockResolvedValue({});
});

function mockTx(amount: number, date = "2026-07-08T00:00:00Z") {
  (prisma.financeBankTransaction.findFirst as Fn).mockResolvedValue({
    id: "tx-1", amount, transactionDate: new Date(date), description: "PAGO TURNO",
  });
  (prisma.financeCashflowOccurrence.findFirst as Fn).mockResolvedValue(null); // no linkeado
  (prisma.financeCashflowCategory.findFirst as Fn).mockResolvedValue({
    id: "cat-te", kind: "EXPENSE", isTaxExempt: true,
  });
}

describe("assignBankTxToCategory — regla anti-suma (Opción A)", () => {
  it("CONSUME el proyectado: 5M proyectado + 4M real → 4M reales, varianza -1M (NO 9M)", async () => {
    mockTx(-4_000_000);
    (resolveConsumableProjection as Fn).mockResolvedValue({
      kind: "virtual", itemId: "it-te", scheduledDate: new Date("2026-07-10T00:00:00Z"),
      projectedGrossClp: 5_000_000,
    });

    const r = await assignBankTxToCategory(TENANT, USER, {
      bankTransactionId: "tx-1", categoryId: "cat-te",
    });

    expect(r.mode).toBe("consumed");
    expect(r.realClp).toBe(4_000_000);
    expect(r.projectedClp).toBe(5_000_000);
    expect(r.varianceClp).toBe(-1_000_000);
    // NO crea item nuevo al consumir.
    expect(prisma.financeCashflowItem.create).not.toHaveBeenCalled();
    // La occurrence PAID muestra el REAL (4M) en amountClp, y guarda el
    // proyectado (5M) en amountOverride. La celda del flujo suma 4M, no 9M.
    const occData = (prisma.financeCashflowOccurrence.create as Fn).mock.calls[0][0].data;
    expect(occData.status).toBe("PAID");
    expect(num(occData.amountClp)).toBe(4_000_000);
    expect(num(occData.amountOverride)).toBe(5_000_000);
    expect(occData.scheduledDate.toISOString().slice(0, 10)).toBe("2026-07-10");
    expect(prisma.financeBankTransaction.update).toHaveBeenCalledWith({
      where: { id: "tx-1" }, data: { reconciliationStatus: "MATCHED" },
    });
  });

  it("REAL PURO: sin proyectado → crea item + occurrence PAID con el real", async () => {
    mockTx(-3_000_000);
    (resolveConsumableProjection as Fn).mockResolvedValue(null);

    const r = await assignBankTxToCategory(TENANT, USER, {
      bankTransactionId: "tx-1", categoryId: "cat-te", name: "Gasto puntual",
    });

    expect(r.mode).toBe("created");
    expect(r.realClp).toBe(3_000_000);
    const itemData = (prisma.financeCashflowItem.create as Fn).mock.calls[0][0].data;
    expect(itemData.source).toBe("MANUAL");
    expect(itemData.recurrence).toBe("ONCE");
    const occData = (prisma.financeCashflowOccurrence.create as Fn).mock.calls[0][0].data;
    expect(occData.status).toBe("PAID");
    expect(num(occData.amountClp)).toBe(3_000_000);
  });

  it("respeta la recurrencia del caller SOLO en rama B (real puro)", async () => {
    mockTx(-1_000_000);
    (resolveConsumableProjection as Fn).mockResolvedValue(null);
    await assignBankTxToCategory(TENANT, USER, {
      bankTransactionId: "tx-1", categoryId: "cat-te", name: "Arriendo", recurrence: "MONTHLY",
    });
    const itemData = (prisma.financeCashflowItem.create as Fn).mock.calls[0][0].data;
    expect(itemData.recurrence).toBe("MONTHLY");
  });

  it("bucketea el tx en la semana correcta (sábado tras el cierre del viernes)", async () => {
    mockTx(-1_000_000, "2026-07-04T00:00:00Z"); // sábado
    (resolveConsumableProjection as Fn).mockResolvedValue(null);
    await assignBankTxToCategory(TENANT, USER, { bankTransactionId: "tx-1", categoryId: "cat-te" });

    const args = (resolveConsumableProjection as Fn).mock.calls[0][1];
    expect(args.weekStart.toISOString().slice(0, 10)).toBe("2026-07-04"); // sábado inicio
    expect(args.weekEnd.toISOString().slice(0, 10)).toBe("2026-07-10"); // viernes cierre
  });

  it("rechaza un tx ya vinculado (409)", async () => {
    mockTx(-1_000_000);
    (prisma.financeCashflowOccurrence.findFirst as Fn).mockResolvedValue({ id: "occ-x" });
    await expect(
      assignBankTxToCategory(TENANT, USER, { bankTransactionId: "tx-1", categoryId: "cat-te" }),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe("revertBankTxCategoryAssignment — undo", () => {
  it("undo CONSUMED: devuelve la occurrence a PROJECTED con el monto original y el tx a UNMATCHED", async () => {
    (prisma.financeCashflowOccurrence.findFirst as Fn).mockResolvedValue({
      id: "occ-mat", itemId: "it-te", amountOverride: 5_000_000,
      item: { id: "it-te", source: "TURNOS_EXTRA", recurrence: "WEEKLY", _count: { occurrences: 3 } },
    });

    const r = await revertBankTxCategoryAssignment(TENANT, USER, "tx-1");
    expect(r.mode).toBe("consumed");
    const upd = (prisma.financeCashflowOccurrence.update as Fn).mock.calls[0][0];
    expect(upd.data.status).toBe("PROJECTED");
    expect(upd.data.bankTransactionId).toBeNull();
    expect(num(upd.data.amountClp)).toBe(5_000_000);
    expect(prisma.financeCashflowItem.delete).not.toHaveBeenCalled();
    expect(prisma.financeBankTransaction.update).toHaveBeenCalledWith({
      where: { id: "tx-1" }, data: { reconciliationStatus: "UNMATCHED" },
    });
  });

  it("undo CREATED: borra occurrence + item y el tx vuelve a UNMATCHED", async () => {
    (prisma.financeCashflowOccurrence.findFirst as Fn).mockResolvedValue({
      id: "occ-new", itemId: "item-new", amountOverride: 3_000_000,
      item: { id: "item-new", source: "MANUAL", recurrence: "ONCE", _count: { occurrences: 1 } },
    });

    const r = await revertBankTxCategoryAssignment(TENANT, USER, "tx-1");
    expect(r.mode).toBe("created");
    expect(prisma.financeCashflowOccurrence.delete).toHaveBeenCalledWith({ where: { id: "occ-new" } });
    expect(prisma.financeCashflowItem.delete).toHaveBeenCalledWith({ where: { id: "item-new" } });
    expect(prisma.financeBankTransaction.update).toHaveBeenCalledWith({
      where: { id: "tx-1" }, data: { reconciliationStatus: "UNMATCHED" },
    });
  });
});
