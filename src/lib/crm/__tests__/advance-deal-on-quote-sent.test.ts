import { beforeEach, describe, expect, it, vi } from "vitest";

const findStage = vi.fn();
const updateMany = vi.fn();
const createHistory = vi.fn();
const findDeal = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {},
}));

import {
  advanceDealToQuoteSentStage,
  markDealProposalSent,
} from "@/lib/crm/advance-deal-on-quote-sent";

function makeDb() {
  return {
    crmPipelineStage: { findFirst: findStage },
    crmDeal: { updateMany, findFirst: findDeal },
    crmDealStageHistory: { create: createHistory },
  } as any;
}

describe("advanceDealToQuoteSentStage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("mueve etapa y fuerza status open (reabre lost)", async () => {
    findStage.mockResolvedValue({ id: "stage-cotizacion" });
    updateMany.mockResolvedValue({ count: 1 });
    createHistory.mockResolvedValue({});

    const result = await advanceDealToQuoteSentStage({
      db: makeDb(),
      tenantId: "t1",
      dealId: "d1",
      fromStageId: "stage-perdido",
      changedBy: "user-1",
    });

    expect(result).toEqual({ moved: true, stageId: "stage-cotizacion" });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "d1", tenantId: "t1" },
      data: { stageId: "stage-cotizacion", status: "open" },
    });
    expect(createHistory).toHaveBeenCalled();
  });

  it("si ya está en la etapa, solo reabre status si no es open", async () => {
    findStage.mockResolvedValue({ id: "stage-cotizacion" });
    updateMany.mockResolvedValue({ count: 1 });

    const result = await advanceDealToQuoteSentStage({
      db: makeDb(),
      tenantId: "t1",
      dealId: "d1",
      fromStageId: "stage-cotizacion",
      changedBy: "user-1",
    });

    expect(result.moved).toBe(false);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "d1", tenantId: "t1", status: { not: "open" } },
      data: { status: "open" },
    });
    expect(createHistory).not.toHaveBeenCalled();
  });
});

describe("markDealProposalSent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("asigna primaryContactId si el deal no tiene contacto", async () => {
    findDeal.mockResolvedValue({ id: "d1", primaryContactId: null });
    updateMany.mockResolvedValue({ count: 1 });

    await markDealProposalSent({
      db: makeDb(),
      tenantId: "t1",
      dealId: "d1",
      data: {
        proposalSentAt: new Date("2026-08-01T12:00:00Z"),
        primaryContactId: "contact-1",
        amount: 1000,
      },
    });

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "open",
          primaryContactId: "contact-1",
          amount: 1000,
        }),
      }),
    );
  });
});
