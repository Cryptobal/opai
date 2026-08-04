import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../plan.service", () => ({
  upsertCell: vi.fn(async (_t: string, rowId: string, weekStart: string, amount: number) => ({
    rowId,
    weekStart,
    amount,
    updatedBy: "u1",
  })),
}));
vi.mock("../cell-note.service", () => ({
  upsertCellNote: vi.fn(async () => ({
    rowId: "row-1",
    weekStart: "2026-08-03",
    body: "ok",
    updatedBy: "u1",
  })),
}));
vi.mock("../weekly-close.adapter", () => ({
  assertV3WeeksWritable: vi.fn(async () => undefined),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    financeDte: { findFirst: vi.fn() },
    financeFlowRow: { findFirst: vi.fn() },
    financeFlowCellNote: { findFirst: vi.fn() },
    financeFlowPlanCell: { findFirst: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { upsertCell } from "../plan.service";
import { upsertCellNote } from "../cell-note.service";
import { assertV3WeeksWritable } from "../weekly-close.adapter";
import { pinReceivedDteToFlow } from "../pin-dte-to-flow.service";

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;
const TENANT = "t1";
const WEEK = "2026-08-03";

beforeEach(() => {
  vi.clearAllMocks();
  asMock(assertV3WeeksWritable).mockResolvedValue(undefined);
  asMock(prisma.financeDte.findFirst).mockResolvedValue({
    id: "dte-1",
    direction: "RECEIVED",
    folio: 123,
    issuerName: "Proveedor SpA",
    amountPending: 50_000,
    paymentStatus: "UNPAID",
    voidedByCreditNoteId: null,
    siiStatus: "ACCEPTED",
  });
  asMock(prisma.financeFlowRow.findFirst).mockResolvedValue({
    id: "row-1",
    section: "GAV",
    archivedAt: null,
    name: "Arriendo",
  });
  asMock(prisma.financeFlowCellNote.findFirst).mockResolvedValue(null);
  asMock(prisma.financeFlowPlanCell.findFirst).mockResolvedValue({ amount: 10_000 });
});

describe("pinReceivedDteToFlow", () => {
  it("suma el pendiente sobre el plan preexistente y escribe nota", async () => {
    const r = await pinReceivedDteToFlow({
      tenantId: TENANT,
      userId: "u1",
      dteId: "dte-1",
      rowId: "row-1",
      weekStart: WEEK,
    });
    expect(upsertCell).toHaveBeenCalledWith(
      TENANT,
      "row-1",
      WEEK,
      60_000,
      "u1",
      expect.objectContaining({ userId: "u1" }),
    );
    expect(upsertCellNote).toHaveBeenCalledWith(
      TENANT,
      "row-1",
      WEEK,
      "Fijado F°123 · Proveedor SpA",
      "u1",
    );
    expect(r.alreadyPinned).toBe(false);
    expect(r.amount).toBe(60_000);
  });

  it("es idempotente si la nota ya referencia el folio", async () => {
    asMock(prisma.financeFlowCellNote.findFirst).mockResolvedValue({
      body: "Fijado F°123 · Proveedor SpA",
    });
    asMock(prisma.financeFlowPlanCell.findFirst).mockResolvedValue({ amount: 60_000 });
    const r = await pinReceivedDteToFlow({
      tenantId: TENANT,
      userId: "u1",
      dteId: "dte-1",
      rowId: "row-1",
      weekStart: WEEK,
    });
    expect(upsertCell).not.toHaveBeenCalled();
    expect(r.alreadyPinned).toBe(true);
    expect(r.amount).toBe(60_000);
  });

  it("rechaza semana cerrada", async () => {
    asMock(assertV3WeeksWritable).mockRejectedValue(
      new Error("Semana cerrada: reábrela para editar su plan"),
    );
    await expect(
      pinReceivedDteToFlow({
        tenantId: TENANT,
        userId: "u1",
        dteId: "dte-1",
        rowId: "row-1",
        weekStart: WEEK,
      }),
    ).rejects.toThrow(/Semana cerrada/);
  });

  it("rechaza DTE de otro tenant (findFirst null)", async () => {
    asMock(prisma.financeDte.findFirst).mockResolvedValue(null);
    await expect(
      pinReceivedDteToFlow({
        tenantId: TENANT,
        userId: "u1",
        dteId: "dte-x",
        rowId: "row-1",
        weekStart: WEEK,
      }),
    ).rejects.toThrow(/DTE no encontrado/);
  });
});
