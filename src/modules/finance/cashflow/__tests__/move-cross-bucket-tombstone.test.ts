/**
 * Fix "lápida al mover cruzando de bucket": una proyección pura MONTHLY movida
 * de un mes a otro deja lápida CANCELLED en el origen (si no, el slot-claim
 * libera el bucket original y la proyección reaparece). Mockea Prisma, sin DB.
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
      create: vi.fn(),
    },
    financeCashflowWeeklyClose: { findFirst: vi.fn() },
  },
}));

vi.mock("../uf-resolver", () => ({ resolveUfForOccurrence: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { moveOccurrence } from "../occurrence.service";

type Mock = ReturnType<typeof vi.fn>;
const occ = prisma.financeCashflowOccurrence;

const TENANT = "tenant-1";
const ITEM_ID = "item-1";
const OCC_ID = "occ-moving";
const D = (iso: string) => new Date(`${iso}T00:00:00Z`);

/** Fija los mocks base: el `existing` de moveOccurrence + el source del resolver. */
function setup(opts: {
  from: Date;
  source: Record<string, unknown>;
  collision?: Record<string, unknown> | null;
}) {
  (prisma.financeCashflowWeeklyClose.findFirst as Mock).mockResolvedValue(null);
  (occ.findFirst as Mock)
    .mockResolvedValueOnce({
      id: OCC_ID,
      itemId: ITEM_ID,
      scheduledDate: opts.from,
      status: "PROJECTED",
    })
    .mockResolvedValueOnce(opts.collision ?? null);
  (occ.findUnique as Mock).mockResolvedValue(opts.source);
  (occ.update as Mock).mockResolvedValue({ id: OCC_ID });
  (occ.delete as Mock).mockResolvedValue({});
  (occ.create as Mock).mockResolvedValue({ id: "occ-tombstone" });
}

const pureSource = (scheduledDate: Date) => ({
  scheduledDate, dteId: null, bankTransactionId: null, item: { recurrence: "MONTHLY" },
});

beforeEach(() => vi.clearAllMocks());

describe("resolveCollisionAndMove — lápida cross-bucket", () => {
  it("(a) MONTHLY 15-jun → 10-jul: update + lápida CANCELLED en 15-jun", async () => {
    setup({ from: D("2026-06-15"), source: pureSource(D("2026-06-15")) });

    await moveOccurrence(TENANT, OCC_ID, {
      newDate: D("2026-07-10"),
      daysFromCurrent: null,
    });

    expect(occ.update).toHaveBeenCalledTimes(1);
    expect(occ.create).toHaveBeenCalledTimes(1);
    const data = (occ.create as Mock).mock.calls[0][0].data;
    expect(data).toMatchObject({
      tenantId: TENANT,
      itemId: ITEM_ID,
      amountClp: 0,
      status: "CANCELLED",
    });
    expect((data.scheduledDate as Date).toISOString().slice(0, 10)).toBe(
      "2026-06-15",
    );
  });

  it("(b) 8-jun → 22-jun (mismo mes): sin lápida", async () => {
    setup({ from: D("2026-06-08"), source: pureSource(D("2026-06-08")) });

    await moveOccurrence(TENANT, OCC_ID, {
      newDate: D("2026-06-22"),
      daysFromCurrent: null,
    });

    expect(occ.update).toHaveBeenCalledTimes(1);
    expect(occ.create).not.toHaveBeenCalled();
  });

  it("(c) volver 10-jul → 15-jun con lápida: se borra, sin error, y deja lápida en 10-jul", async () => {
    setup({
      from: D("2026-07-10"),
      source: pureSource(D("2026-07-10")),
      collision: {
        id: "occ-tombstone-jun",
        status: "CANCELLED",
        dteId: null,
        bankTransactionId: null,
        isClosingAdjust: false,
        item: { name: "Arriendo" },
      },
    });

    const result = await moveOccurrence(TENANT, OCC_ID, {
      newDate: D("2026-06-15"),
      daysFromCurrent: null,
    });

    // La lápida del destino (15-jun) se borra: volver nunca choca.
    expect(occ.delete).toHaveBeenCalledWith({ where: { id: "occ-tombstone-jun" } });
    expect(result.clearedCancelled).toBe(true);
    expect(occ.update).toHaveBeenCalledTimes(1);
    // Y se deja lápida en el nuevo origen (10-jul), simétrico.
    const data = (occ.create as Mock).mock.calls[0][0].data;
    expect((data.scheduledDate as Date).toISOString().slice(0, 10)).toBe(
      "2026-07-10",
    );
    expect(data.status).toBe("CANCELLED");
  });

  it("(d) cuota con dteId cruzando de mes: sin lápida (es fuerte)", async () => {
    setup({
      from: D("2026-06-15"),
      source: {
        scheduledDate: D("2026-06-15"),
        dteId: "dte-1",
        bankTransactionId: null,
        item: { recurrence: "MONTHLY" },
      },
    });

    await moveOccurrence(TENANT, OCC_ID, {
      newDate: D("2026-07-10"),
      daysFromCurrent: null,
    });

    expect(occ.update).toHaveBeenCalledTimes(1);
    expect(occ.create).not.toHaveBeenCalled();
  });
});
