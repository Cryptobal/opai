/**
 * Tests del sync idempotente CpqQuote → FinanceCashflowItem (source=CONTRACT).
 * Mockea Prisma para validar la lógica de upsert/deactivate sin tocar DB.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/prisma", () => {
  return {
    prisma: {
      cpqQuote: { findFirst: vi.fn(), findMany: vi.fn() },
      financeCashflowCategory: { findFirst: vi.fn() },
      financeCashflowItem: {
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
    },
  };
});

import { prisma } from "@/lib/prisma";
import {
  syncContractItemForQuote,
  backfillContractItems,
  setContractItemsActive,
} from "../generators/sales-contract-sync";

const TENANT = "tenant-1";
const TENANT_B = "tenant-2";
const CAT_ID = "cat-ventas";

function makeQuote(overrides: Record<string, unknown> = {}) {
  return {
    id: "quote-1",
    tenantId: TENANT,
    code: "CPQ-2026-001",
    name: "Servicio Edificio X",
    clientName: "Acme",
    accountId: "acc-1",
    installationId: "inst-1",
    installation: { name: "Edificio X" },
    monthlyCost: 1_500_000,
    currency: "CLP",
    contractStartDate: new Date("2026-06-01"),
    contractDuration: 12,
    paymentDays: 5,
    paymentDayMode: "SPECIFIC_DAY",
    paymentTerms: "Prepago",
    realAnnualIncrement: 3,
    status: "accepted",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: la categoría existe y está activa.
  (prisma.financeCashflowCategory.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
    id: CAT_ID,
  });
});

describe("syncContractItemForQuote", () => {
  it("crea un item nuevo cuando el contrato está activo y no hay item previo", async () => {
    (prisma.cpqQuote.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(makeQuote());
    (prisma.financeCashflowItem.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.financeCashflowItem.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "item-new",
    });

    const r = await syncContractItemForQuote(TENANT, "quote-1");

    expect(r.action).toBe("created");
    const createCall = (prisma.financeCashflowItem.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(createCall.data.tenantId).toBe(TENANT);
    expect(createCall.data.source).toBe("CONTRACT");
    expect(createCall.data.sourceRefId).toBe("quote-1");
    expect(createCall.data.kind).toBe("INCOME");
    expect(createCall.data.recurrence).toBe("MONTHLY");
    expect(createCall.data.dayOfMonth).toBe(5);
    expect(createCall.data.amount).toBe(1_500_000);
    expect(createCall.data.installationId).toBe("inst-1");
    expect(createCall.data.crmAccountId).toBe("acc-1");
    expect(createCall.data.isActive).toBe(true);
  });

  it("hace noop cuando el quote no está en estado activo", async () => {
    (prisma.cpqQuote.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeQuote({ status: "draft" }),
    );
    (prisma.financeCashflowItem.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const r = await syncContractItemForQuote(TENANT, "quote-1");

    expect(r.action).toBe("noop");
    expect(prisma.financeCashflowItem.create).not.toHaveBeenCalled();
  });

  it("desactiva el item cuando el quote pasa a un estado inactivo (rejected/draft)", async () => {
    (prisma.cpqQuote.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeQuote({ status: "rejected" }),
    );
    (prisma.financeCashflowItem.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "item-existing",
      isActive: true,
    });
    (prisma.financeCashflowItem.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "item-existing",
    });

    const r = await syncContractItemForQuote(TENANT, "quote-1");

    expect(r.action).toBe("deactivated");
    const updateCall = (prisma.financeCashflowItem.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(updateCall.where.id).toBe("item-existing");
    expect(updateCall.data).toEqual({ isActive: false });
  });

  it("reactiva un item desactivado cuando el quote vuelve a estar activo", async () => {
    (prisma.cpqQuote.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(makeQuote());
    (prisma.financeCashflowItem.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "item-existing",
      isActive: false,
    });
    (prisma.financeCashflowItem.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "item-existing",
    });

    const r = await syncContractItemForQuote(TENANT, "quote-1");

    expect(r.action).toBe("reactivated");
    const updateCall = (prisma.financeCashflowItem.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(updateCall.data.isActive).toBe(true);
    expect(updateCall.data.amount).toBe(1_500_000);
  });

  it("actualiza un item existente cuando cambia monthlyCost", async () => {
    (prisma.cpqQuote.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeQuote({ monthlyCost: 2_000_000 }),
    );
    (prisma.financeCashflowItem.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "item-existing",
      isActive: true,
    });
    (prisma.financeCashflowItem.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "item-existing",
    });

    const r = await syncContractItemForQuote(TENANT, "quote-1");

    expect(r.action).toBe("updated");
    const updateCall = (prisma.financeCashflowItem.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(updateCall.data.amount).toBe(2_000_000);
  });

  it("hace postpago: startDate = contractStartDate + 1 mes cuando paymentTerms incluye 'contrafactura'", async () => {
    (prisma.cpqQuote.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeQuote({ paymentTerms: "Pago contrafactura 30 días" }),
    );
    (prisma.financeCashflowItem.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.financeCashflowItem.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "x" });

    await syncContractItemForQuote(TENANT, "quote-1");
    const createCall = (prisma.financeCashflowItem.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    // Original start = 2026-06-01, postpago → start = 2026-07-01
    expect((createCall.data.startDate as Date).getMonth()).toBe(6); // Julio (0-indexed)
  });

  it("LAST_BUSINESS_DAY → dayOfMonth = -1", async () => {
    (prisma.cpqQuote.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeQuote({ paymentDayMode: "LAST_BUSINESS_DAY" }),
    );
    (prisma.financeCashflowItem.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.financeCashflowItem.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "x" });

    await syncContractItemForQuote(TENANT, "quote-1");
    const createCall = (prisma.financeCashflowItem.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(createCall.data.dayOfMonth).toBe(-1);
  });

  it("SPECIFIC_DAY con paymentDays=31 → cap a 28 para evitar meses sin día 31", async () => {
    (prisma.cpqQuote.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeQuote({ paymentDays: 31 }),
    );
    (prisma.financeCashflowItem.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.financeCashflowItem.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "x" });

    await syncContractItemForQuote(TENANT, "quote-1");
    const createCall = (prisma.financeCashflowItem.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(createCall.data.dayOfMonth).toBe(28);
  });

  it("hace noop si el quote no existe (multi-tenant safety: tenant equivocado)", async () => {
    (prisma.cpqQuote.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const r = await syncContractItemForQuote(TENANT_B, "quote-from-tenant-1");
    expect(r.action).toBe("noop");
    expect(prisma.financeCashflowItem.create).not.toHaveBeenCalled();
  });

  it("hace noop si el tenant aún no inicializó la categoría ING_VENTA_CONTRATO", async () => {
    (prisma.cpqQuote.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(makeQuote());
    (prisma.financeCashflowCategory.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const r = await syncContractItemForQuote(TENANT, "quote-1");
    expect(r.action).toBe("noop");
  });

  it("hace noop si monthlyCost = 0 (contrato sin precio configurado)", async () => {
    (prisma.cpqQuote.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeQuote({ monthlyCost: 0 }),
    );
    (prisma.financeCashflowItem.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const r = await syncContractItemForQuote(TENANT, "quote-1");
    expect(r.action).toBe("noop");
  });
});

describe("backfillContractItems", () => {
  it("sincroniza todos los quotes del tenant y agrega stats; idempotente al re-correr", async () => {
    (prisma.cpqQuote.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "q1" },
      { id: "q2" },
      { id: "q3" },
    ]);
    // Primer correr: q1 nuevo, q2 nuevo, q3 inactivo (deactivated)
    let callCount = 0;
    (prisma.cpqQuote.findFirst as ReturnType<typeof vi.fn>).mockImplementation(async ({ where }: any) => {
      callCount++;
      if (where.id === "q3") return makeQuote({ id: "q3", status: "rejected" });
      return makeQuote({ id: where.id });
    });
    (prisma.financeCashflowItem.findFirst as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ where }: any) => {
        if (where.sourceRefId === "q3") return { id: "item-q3", isActive: true };
        return null;
      },
    );
    (prisma.financeCashflowItem.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "x" });
    (prisma.financeCashflowItem.update as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "x" });

    const stats = await backfillContractItems(TENANT);
    expect(stats.created).toBe(2);
    expect(stats.deactivated).toBe(1);
    expect(callCount).toBe(3);
  });
});

describe("setContractItemsActive", () => {
  it("hace updateMany filtrado por tenantId y source=CONTRACT", async () => {
    (prisma.financeCashflowItem.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 12,
    });
    const r = await setContractItemsActive(TENANT, false);
    expect(r.affected).toBe(12);
    const call = (prisma.financeCashflowItem.updateMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.where.tenantId).toBe(TENANT);
    expect(call.where.source).toBe("CONTRACT");
    expect(call.data.isActive).toBe(false);
  });
});
