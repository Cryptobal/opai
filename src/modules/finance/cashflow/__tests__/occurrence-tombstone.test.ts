/**
 * Tests de la regla "las lápidas CANCELLED nunca bloquean". Una occurrence
 * CANCELLED pura (sin DTE, sin banco, sin ajuste de cierre) es invisible en la
 * grilla: si bloqueara un move, el usuario vería "Ya existe otra cuota..."
 * contra algo que no existe para él. Mockea Prisma, sin DB.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    financeCashflowOccurrence: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    financeCashflowWeeklyClose: { findFirst: vi.fn() },
  },
}));

vi.mock("../uf-resolver", () => ({
  resolveUfForOccurrence: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { moveOccurrence, OccurrenceCollisionError } from "../occurrence.service";

type Mock = ReturnType<typeof vi.fn>;

const TENANT = "tenant-1";
const ITEM_ID = "item-1";
const OCC_ID = "occ-moving";
const TARGET = new Date("2026-07-20T00:00:00Z");

/** Occurrence que el usuario está moviendo (proyección pura). */
const MOVING = {
  id: OCC_ID,
  itemId: ITEM_ID,
  scheduledDate: new Date("2026-07-10T00:00:00Z"),
  status: "PROJECTED",
};

function tombstone(overrides: Record<string, unknown> = {}) {
  return {
    id: "occ-tombstone",
    status: "CANCELLED",
    dteId: null,
    bankTransactionId: null,
    isClosingAdjust: false,
    item: { name: "Arriendo" },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  (prisma.financeCashflowWeeklyClose.findFirst as Mock).mockResolvedValue(null);
  // Nivel de la occurrence que se mueve: proyección pura (weak).
  (prisma.financeCashflowOccurrence.findUnique as Mock).mockResolvedValue({
    dteId: null,
    bankTransactionId: null,
    status: "PROJECTED",
  });
  (prisma.financeCashflowOccurrence.update as Mock).mockResolvedValue({ id: OCC_ID });
  (prisma.financeCashflowOccurrence.delete as Mock).mockResolvedValue({});
});

describe("moveOccurrence — lápidas CANCELLED", () => {
  it("mover sobre una lápida: la borra, mueve igual y reporta clearedCancelled", async () => {
    (prisma.financeCashflowOccurrence.findFirst as Mock)
      .mockResolvedValueOnce(MOVING) // existing
      .mockResolvedValueOnce(tombstone()); // colisión en el destino

    const result = await moveOccurrence(TENANT, OCC_ID, {
      newDate: TARGET,
      daysFromCurrent: null,
    });

    expect(prisma.financeCashflowOccurrence.delete).toHaveBeenCalledWith({
      where: { id: "occ-tombstone" },
    });
    expect(result.clearedCancelled).toBe(true);
    // No es un "overwrote": no se pisó nada que el usuario viera.
    expect(result.overwrote).toBeUndefined();

    const updateCall = (prisma.financeCashflowOccurrence.update as Mock).mock.calls[0][0];
    expect(updateCall.where).toEqual({ id: OCC_ID });
    expect((updateCall.data.scheduledDate as Date).toISOString().slice(0, 10)).toBe(
      "2026-07-20",
    );
  });

  it("CANCELLED con dteId NO es lápida: cae al flujo de colisión normal (target_is_stronger)", async () => {
    (prisma.financeCashflowOccurrence.findFirst as Mock)
      .mockResolvedValueOnce(MOVING)
      .mockResolvedValueOnce(tombstone({ dteId: "dte-1" }));

    await expect(
      moveOccurrence(TENANT, OCC_ID, { newDate: TARGET, daysFromCurrent: null }),
    ).rejects.toBeInstanceOf(OccurrenceCollisionError);

    expect(prisma.financeCashflowOccurrence.delete).not.toHaveBeenCalled();
    expect(prisma.financeCashflowOccurrence.update).not.toHaveBeenCalled();
  });

  it("CANCELLED conciliada con banco NO es lápida: no se borra", async () => {
    (prisma.financeCashflowOccurrence.findFirst as Mock)
      .mockResolvedValueOnce(MOVING)
      .mockResolvedValueOnce(tombstone({ bankTransactionId: "btx-1" }));

    await expect(
      moveOccurrence(TENANT, OCC_ID, { newDate: TARGET, daysFromCurrent: null }),
    ).rejects.toBeInstanceOf(OccurrenceCollisionError);

    expect(prisma.financeCashflowOccurrence.delete).not.toHaveBeenCalled();
  });

  it("CANCELLED que es ajuste de cierre NO es lápida: no se borra", async () => {
    (prisma.financeCashflowOccurrence.findFirst as Mock)
      .mockResolvedValueOnce(MOVING)
      .mockResolvedValueOnce(tombstone({ isClosingAdjust: true }));

    await expect(
      moveOccurrence(TENANT, OCC_ID, { newDate: TARGET, daysFromCurrent: null }),
    ).rejects.toBeInstanceOf(OccurrenceCollisionError);

    expect(prisma.financeCashflowOccurrence.delete).not.toHaveBeenCalled();
  });

  it("sin colisión: mueve sin reportar clearedCancelled", async () => {
    (prisma.financeCashflowOccurrence.findFirst as Mock)
      .mockResolvedValueOnce(MOVING)
      .mockResolvedValueOnce(null);

    const result = await moveOccurrence(TENANT, OCC_ID, {
      newDate: TARGET,
      daysFromCurrent: null,
    });

    expect(result.clearedCancelled).toBeUndefined();
    expect(prisma.financeCashflowOccurrence.delete).not.toHaveBeenCalled();
    expect(prisma.financeCashflowOccurrence.update).toHaveBeenCalled();
  });
});
