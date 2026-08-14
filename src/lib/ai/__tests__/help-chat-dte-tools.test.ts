import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RolePermissions } from "@/lib/permissions";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    financeDte: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      groupBy: vi.fn(),
      aggregate: vi.fn(),
    },
    financeRendicion: {
      groupBy: vi.fn(),
      aggregate: vi.fn(),
    },
    crmAccount: { findMany: vi.fn(), findFirst: vi.fn() },
    crmInstallation: { findFirst: vi.fn() },
    financeBankTransactionLink: { findMany: vi.fn() },
    aiActionLog: { create: vi.fn() },
  },
}));

const listReceivedDtesMock = vi.hoisted(() => vi.fn());
const assignDteCostCenterMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/finance/billing/dte-received.service", () => ({
  listReceivedDtes: listReceivedDtesMock,
}));

vi.mock("@/modules/finance/billing/dte-cost-center.service", () => ({
  assignDteCostCenter: assignDteCostCenterMock,
  AssignDteCostCenterError: class AssignDteCostCenterError extends Error {
    constructor(
      message: string,
      public code: "NOT_FOUND" | "INVALID",
    ) {
      super(message);
      this.name = "AssignDteCostCenterError";
    }
  },
}));

import { prisma } from "@/lib/prisma";
import {
  buildSearchDtesDirectionWhere,
  getToolDefinitionsV2,
  toolGetDteDetail,
  toolGetFinanceSummary,
  toolSearchDtes,
  toolSearchReceivedDtes,
  toolUpdateDteCostCenter,
  WRITE_TOOL_NAMES,
} from "@/lib/ai/help-chat-tools-v2";

const permsNone = { modules: {}, capabilities: {} } as unknown as RolePermissions;
const permsView = {
  modules: {},
  capabilities: { facturacion_view: true },
} as unknown as RolePermissions;
const permsManage = {
  modules: {},
  capabilities: { facturacion_manage: true },
} as unknown as RolePermissions;

describe("buildSearchDtesDirectionWhere", () => {
  it("sin direction produce where.direction === ISSUED (retrocompatibilidad)", () => {
    expect(buildSearchDtesDirectionWhere(undefined)).toEqual({ direction: "ISSUED" });
    expect(buildSearchDtesDirectionWhere("issued")).toEqual({ direction: "ISSUED" });
  });

  it('con direction:"received" produce where.direction === RECEIVED', () => {
    expect(buildSearchDtesDirectionWhere("received")).toEqual({ direction: "RECEIVED" });
  });

  it('con direction:"all" no incluye la clave direction', () => {
    const where = buildSearchDtesDirectionWhere("all");
    expect(where).toEqual({});
    expect("direction" in where).toBe(false);
  });
});

describe("tool wiring", () => {
  it("search_received_dtes aparece en lectura; update_dte_cost_center solo con writes", () => {
    const readNames = new Set(getToolDefinitionsV2(true, false).map((d) => d.function.name));
    const writeNames = new Set(getToolDefinitionsV2(true, true).map((d) => d.function.name));
    expect(readNames.has("search_received_dtes")).toBe(true);
    expect(writeNames.has("search_received_dtes")).toBe(true);
    expect(readNames.has("update_dte_cost_center")).toBe(false);
    expect(writeNames.has("update_dte_cost_center")).toBe(true);
    expect(WRITE_TOOL_NAMES.has("update_dte_cost_center")).toBe(true);
    expect(WRITE_TOOL_NAMES.has("search_received_dtes")).toBe(false);
    expect(WRITE_TOOL_NAMES.has("search_dtes")).toBe(false);
  });
});

describe("gates de capability", () => {
  it("las tres tools de lectura DTE rechazan sin facturacion_view", async () => {
    const denied = "No tienes permiso facturacion_view para consultar documentos tributarios.";
    await expect(toolSearchDtes("t1", permsNone, {})).resolves.toEqual({
      ok: false,
      error: denied,
    });
    await expect(toolGetDteDetail("t1", permsNone, { folio: 1 })).resolves.toEqual({
      ok: false,
      error: denied,
    });
    await expect(toolSearchReceivedDtes("t1", permsNone, {})).resolves.toEqual({
      ok: false,
      error: denied,
    });
    expect(prisma.financeDte.findMany).not.toHaveBeenCalled();
    expect(listReceivedDtesMock).not.toHaveBeenCalled();
  });

  it("update_dte_cost_center rechaza sin facturacion_manage", async () => {
    const r = await toolUpdateDteCostCenter("t1", "u1", permsView, {
      dteId: "11111111-1111-4111-8111-111111111111",
      crmAccountId: "22222222-2222-4222-8222-222222222222",
    });
    expect(r).toEqual({
      ok: false,
      error: "No tienes permiso facturacion_manage para asignar centro de costo.",
    });
    expect(assignDteCostCenterMock).not.toHaveBeenCalled();
  });
});

describe("toolSearchDtes direction", () => {
  beforeEach(() => {
    vi.mocked(prisma.financeDte.findMany).mockReset();
    vi.mocked(prisma.crmAccount.findMany).mockReset();
    vi.mocked(prisma.financeDte.findMany).mockResolvedValue([] as never);
  });

  it("sin direction filtra ISSUED", async () => {
    await toolSearchDtes("t1", permsView, {});
    expect(prisma.financeDte.findMany).toHaveBeenCalledTimes(1);
    const where = vi.mocked(prisma.financeDte.findMany).mock.calls[0]?.[0]?.where as {
      direction?: string;
    };
    expect(where.direction).toBe("ISSUED");
  });

  it('direction:"received" filtra RECEIVED', async () => {
    await toolSearchDtes("t1", permsView, { direction: "received" });
    const where = vi.mocked(prisma.financeDte.findMany).mock.calls[0]?.[0]?.where as {
      direction?: string;
    };
    expect(where.direction).toBe("RECEIVED");
  });

  it('direction:"all" omite la clave direction', async () => {
    await toolSearchDtes("t1", permsView, { direction: "all" });
    const where = vi.mocked(prisma.financeDte.findMany).mock.calls[0]?.[0]?.where as {
      direction?: string;
    };
    expect(where.direction).toBeUndefined();
    expect("direction" in (where ?? {})).toBe(false);
  });
});

describe("toolGetFinanceSummary", () => {
  it("devuelve dtes.issued y dtes.received separados", async () => {
    vi.mocked(prisma.financeRendicion.groupBy).mockResolvedValue([] as never);
    vi.mocked(prisma.financeRendicion.aggregate).mockResolvedValue({
      _sum: { amount: 0 },
    } as never);
    vi.mocked(prisma.financeDte.groupBy)
      .mockResolvedValueOnce([{ paymentStatus: "PAID", _count: { id: 2 } }] as never)
      .mockResolvedValueOnce([{ paymentStatus: "UNPAID", _count: { id: 5 } }] as never);
    vi.mocked(prisma.financeDte.aggregate)
      .mockResolvedValueOnce({ _sum: { totalAmount: 1000 } } as never)
      .mockResolvedValueOnce({ _sum: { totalAmount: 400 } } as never);

    const data = await toolGetFinanceSummary("t1", 30);
    expect(data.dtes.issued).toEqual({
      byPaymentStatus: { PAID: 2 },
      totalAmount: 1000,
    });
    expect(data.dtes.received).toEqual({
      byPaymentStatus: { UNPAID: 5 },
      totalAmount: 400,
    });
    expect("byPaymentStatus" in data.dtes).toBe(false);
    expect("totalAmount" in data.dtes).toBe(false);

    const issuedWhere = vi.mocked(prisma.financeDte.groupBy).mock.calls[0]?.[0]?.where as {
      direction?: string;
    };
    const receivedWhere = vi.mocked(prisma.financeDte.groupBy).mock.calls[1]?.[0]?.where as {
      direction?: string;
    };
    expect(issuedWhere.direction).toBe("ISSUED");
    expect(receivedWhere.direction).toBe("RECEIVED");
  });
});

describe("toolSearchReceivedDtes", () => {
  beforeEach(() => {
    listReceivedDtesMock.mockReset();
  });

  it("delega en listReceivedDtes con onlyWithoutCostCenter y summary", async () => {
    listReceivedDtesMock.mockResolvedValue({
      dtes: [
        {
          id: "d1",
          folio: 10,
          dteType: 33,
          date: new Date("2026-07-01"),
          issuerRut: "11111111-1",
          issuerName: "Uniformes SA",
          supplier: null,
          netAmount: 100,
          taxAmount: 19,
          totalAmount: 119,
          paymentStatus: "UNPAID",
          receptionStatus: "ACCEPTED",
          crmAccountId: null,
          crmAccount: null,
          installationId: null,
          installation: null,
        },
      ],
      pagination: { page: 1, pageSize: 15, total: 1, totalPages: 1 },
      summary: { count: 1, totalNet: 100, totalGross: 119, withoutCostCenter: 1 },
    });

    const r = await toolSearchReceivedDtes("t1", permsView, {
      onlyWithoutCostCenter: true,
      installationId: "inst-1",
      crmAccountId: "acc-1",
      periodo: "2026-07",
    });
    expect(r.ok).toBe(true);
    expect(listReceivedDtesMock).toHaveBeenCalledWith(
      "t1",
      expect.objectContaining({
        onlyWithoutCostCenter: true,
        installationId: "inst-1",
        accountId: "acc-1",
        periodo: "2026-07",
        withSummary: true,
      }),
    );
    if (r.ok) {
      expect(r.data.summary.withoutCostCenter).toBe(1);
      expect(r.data.documents[0]?.installationName).toBeNull();
      expect(r.data.documents[0]?.supplierName).toBe("Uniformes SA");
    }
  });
});

describe("toolGetDteDetail folio ambiguo", () => {
  beforeEach(() => {
    vi.mocked(prisma.financeDte.findMany).mockReset();
    vi.mocked(prisma.financeDte.findFirst).mockReset();
  });

  it("pide direction si el folio existe emitido y recibido", async () => {
    vi.mocked(prisma.financeDte.findMany).mockResolvedValue([
      {
        id: "iss",
        direction: "ISSUED",
        date: new Date("2026-07-01"),
        dteType: 33,
        totalAmount: 1000,
        receiverName: "Cliente",
        receiverRut: "1-9",
        issuerName: null,
        issuerRut: null,
      },
      {
        id: "rcv",
        direction: "RECEIVED",
        date: new Date("2026-07-02"),
        dteType: 33,
        totalAmount: 500,
        receiverName: null,
        receiverRut: null,
        issuerName: "Proveedor",
        issuerRut: "2-7",
      },
    ] as never);

    const r = await toolGetDteDetail("t1", permsView, { folio: 1234 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("Folio ambiguo (existe emitido y recibido). Especificá direction.");
      expect("candidates" in r && Array.isArray(r.candidates)).toBe(true);
    }
    expect(prisma.financeDte.findFirst).not.toHaveBeenCalled();
  });
});

describe("toolUpdateDteCostCenter", () => {
  beforeEach(() => {
    assignDteCostCenterMock.mockReset();
    vi.mocked(prisma.aiActionLog.create).mockResolvedValue({} as never);
  });

  it("asigna con facturacion_manage", async () => {
    assignDteCostCenterMock.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      crmAccountId: "22222222-2222-4222-8222-222222222222",
      installationId: null,
    });
    const r = await toolUpdateDteCostCenter("t1", "u1", permsManage, {
      dteId: "11111111-1111-4111-8111-111111111111",
      crmAccountId: "22222222-2222-4222-8222-222222222222",
      installationId: null,
    });
    expect(r.ok).toBe(true);
    expect(assignDteCostCenterMock).toHaveBeenCalledWith(
      "t1",
      "11111111-1111-4111-8111-111111111111",
      {
        crmAccountId: "22222222-2222-4222-8222-222222222222",
        installationId: null,
      },
    );
  });
});
