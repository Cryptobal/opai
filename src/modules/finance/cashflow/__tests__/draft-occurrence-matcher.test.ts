/**
 * Tests del matcher draft DTE → occurrence proyectada. Mockea Prisma para
 * validar criterios de selección sin DB.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    financeCashflowItem: { findMany: vi.fn() },
    financeCashflowOccurrence: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  matchDraftToOccurrence,
  rebindDraftOccurrencesToIssued,
} from "../draft-occurrence-matcher.service";

type Mock = ReturnType<typeof vi.fn>;

const TENANT = "tenant-1";
const DTE_ID = "dte-1";

beforeEach(() => {
  vi.clearAllMocks();
  // Por default no hay vínculo previo — el guard de idempotencia pasa.
  (prisma.financeCashflowOccurrence.findFirst as Mock).mockResolvedValue(null);
  (prisma.financeCashflowOccurrence.update as Mock).mockResolvedValue({ id: "occ-1" });
  (prisma.financeCashflowOccurrence.updateMany as Mock).mockResolvedValue({ count: 0 });
});

describe("matchDraftToOccurrence", () => {
  it("vincula la occurrence proyectada del cliente al DTE", async () => {
    (prisma.financeCashflowItem.findMany as Mock).mockResolvedValue([
      { id: "item-1" },
    ]);
    (prisma.financeCashflowOccurrence.findMany as Mock).mockResolvedValue([
      {
        id: "occ-1",
        scheduledDate: new Date("2026-05-15"),
        amountClp: 1_000_000,
      },
    ]);

    const result = await matchDraftToOccurrence({
      tenantId: TENANT,
      dteId: DTE_ID,
      crmAccountId: "acc-1",
      installationId: null,
      expectedDate: new Date("2026-05-13"),
      amountClp: 1_000_000,
    });

    expect(result).toEqual({ occurrenceId: "occ-1" });
    expect(prisma.financeCashflowOccurrence.update).toHaveBeenCalledWith({
      where: { id: "occ-1" },
      data: { dteId: DTE_ID },
    });
  });

  it("vincula vía instalación cuando no hay cliente CRM", async () => {
    (prisma.financeCashflowItem.findMany as Mock).mockResolvedValue([
      { id: "item-2" },
    ]);
    (prisma.financeCashflowOccurrence.findMany as Mock).mockResolvedValue([
      {
        id: "occ-2",
        scheduledDate: new Date("2026-05-14"),
        amountClp: 500_000,
      },
    ]);

    const result = await matchDraftToOccurrence({
      tenantId: TENANT,
      dteId: DTE_ID,
      crmAccountId: null,
      installationId: "inst-1",
      expectedDate: new Date("2026-05-13"),
      amountClp: 500_000,
    });

    expect(result).toEqual({ occurrenceId: "occ-2" });
  });

  it("devuelve null cuando no hay items del cliente/instalación", async () => {
    (prisma.financeCashflowItem.findMany as Mock).mockResolvedValue([]);

    const result = await matchDraftToOccurrence({
      tenantId: TENANT,
      dteId: DTE_ID,
      crmAccountId: "acc-1",
      installationId: null,
      expectedDate: new Date("2026-05-13"),
      amountClp: 1_000_000,
    });

    expect(result).toBeNull();
    expect(prisma.financeCashflowOccurrence.update).not.toHaveBeenCalled();
  });

  it("devuelve null cuando no hay candidatas proyectadas en la ventana", async () => {
    (prisma.financeCashflowItem.findMany as Mock).mockResolvedValue([
      { id: "item-1" },
    ]);
    (prisma.financeCashflowOccurrence.findMany as Mock).mockResolvedValue([]);

    const result = await matchDraftToOccurrence({
      tenantId: TENANT,
      dteId: DTE_ID,
      crmAccountId: "acc-1",
      installationId: null,
      expectedDate: new Date("2026-05-13"),
      amountClp: 1_000_000,
    });

    expect(result).toBeNull();
    expect(prisma.financeCashflowOccurrence.update).not.toHaveBeenCalled();
  });

  it("devuelve null cuando no hay crmAccountId ni installationId", async () => {
    const result = await matchDraftToOccurrence({
      tenantId: TENANT,
      dteId: DTE_ID,
      crmAccountId: null,
      installationId: null,
      expectedDate: new Date("2026-05-13"),
      amountClp: 1_000_000,
    });

    expect(result).toBeNull();
    expect(prisma.financeCashflowItem.findMany).not.toHaveBeenCalled();
  });

  it("con empate en fecha, gana la más cercana en monto", async () => {
    (prisma.financeCashflowItem.findMany as Mock).mockResolvedValue([
      { id: "item-1" },
    ]);
    // Dos candidatas equidistantes en fecha (ambas a +2 días del expected).
    // La occ-A vale 1.5M y la occ-B vale 1.0M; el DTE vale 1.0M.
    (prisma.financeCashflowOccurrence.findMany as Mock).mockResolvedValue([
      {
        id: "occ-A",
        scheduledDate: new Date("2026-05-15"),
        amountClp: 1_500_000,
      },
      {
        id: "occ-B",
        scheduledDate: new Date("2026-05-11"),
        amountClp: 1_000_000,
      },
    ]);

    const result = await matchDraftToOccurrence({
      tenantId: TENANT,
      dteId: DTE_ID,
      crmAccountId: "acc-1",
      installationId: null,
      expectedDate: new Date("2026-05-13"),
      amountClp: 1_000_000,
    });

    expect(result).toEqual({ occurrenceId: "occ-B" });
    expect(prisma.financeCashflowOccurrence.update).toHaveBeenCalledWith({
      where: { id: "occ-B" },
      data: { dteId: DTE_ID },
    });
  });

  it("idempotente: si el DTE ya tiene una occurrence vinculada, devuelve esa y no busca", async () => {
    (prisma.financeCashflowOccurrence.findFirst as Mock).mockResolvedValue({
      id: "occ-already",
    });

    const result = await matchDraftToOccurrence({
      tenantId: TENANT,
      dteId: DTE_ID,
      crmAccountId: "acc-1",
      installationId: null,
      expectedDate: new Date("2026-05-13"),
      amountClp: 1_000_000,
    });

    expect(result).toEqual({ occurrenceId: "occ-already" });
    // No busca items ni candidatas porque ya hay vínculo.
    expect(prisma.financeCashflowItem.findMany).not.toHaveBeenCalled();
    expect(prisma.financeCashflowOccurrence.findMany).not.toHaveBeenCalled();
    expect(prisma.financeCashflowOccurrence.update).not.toHaveBeenCalled();
  });

  it("no incluye occurrences ya vinculadas a otro DTE (filtra por dteId=null en la query)", async () => {
    (prisma.financeCashflowItem.findMany as Mock).mockResolvedValue([
      { id: "item-1" },
    ]);
    (prisma.financeCashflowOccurrence.findMany as Mock).mockResolvedValue([]);

    await matchDraftToOccurrence({
      tenantId: TENANT,
      dteId: DTE_ID,
      crmAccountId: "acc-1",
      installationId: null,
      expectedDate: new Date("2026-05-13"),
      amountClp: 1_000_000,
    });

    const findManyCall = (prisma.financeCashflowOccurrence.findMany as Mock).mock
      .calls[0]?.[0];
    expect(findManyCall).toBeDefined();
    expect(findManyCall.where.dteId).toBeNull();
    expect(findManyCall.where.status).toBe("PROJECTED");
  });
});

describe("rebindDraftOccurrencesToIssued", () => {
  it("reasigna todas las occurrences del draft al DTE emitido y devuelve el count", async () => {
    (prisma.financeCashflowOccurrence.updateMany as Mock).mockResolvedValue({
      count: 3,
    });

    const count = await rebindDraftOccurrencesToIssued(
      TENANT,
      "draft-1",
      "issued-1",
    );

    expect(count).toBe(3);
    expect(prisma.financeCashflowOccurrence.updateMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT, dteId: "draft-1" },
      data: { dteId: "issued-1" },
    });
  });
});
