import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
    document: { findFirst: vi.fn() },
    financeDteRecurringTemplate: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    financeCashflowCategory: { findFirst: vi.fn() },
    financeCashflowItem: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    financeCashflowOccurrence: { deleteMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  syncRecurringDteItem,
  backfillRecurringDteItems,
} from "../generators/recurring-dte-sync";

const TENANT = "tenant-1";

function makeTpl(overrides: Record<string, unknown> = {}) {
  return {
    id: "tpl-1",
    tenantId: TENANT,
    name: "Plan Premium",
    receiverName: "Cliente A",
    currency: "CLP",
    lines: [{ quantity: 1, unitPrice: 100_000, discountPct: 0 }],
    frequency: "monthly",
    dayOfMonth: 5,
    dayOfWeek: null,
    monthOfYear: null,
    startDate: new Date("2026-01-01"),
    endDate: null,
    ufFixingPolicy: null,
    ufFixingDay: null,
    installationId: null,
    crmAccountId: "acc-1",
    isActive: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  (prisma.document.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "doc-ok" });
  (prisma.financeCashflowItem.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn(prisma),
  );
  (prisma.financeCashflowCategory.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
    id: "cat-ventas",
  });
});

describe("syncRecurringDteItem", () => {
  it("crea item con monto NETO (= subtotal sin IVA)", async () => {
    (prisma.financeDteRecurringTemplate.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeTpl(),
    );
    (prisma.financeCashflowItem.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.financeCashflowItem.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "x" });

    const r = await syncRecurringDteItem(TENANT, "tpl-1");
    expect(r.action).toBe("created");
    const call = (prisma.financeCashflowItem.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    // NETO: la proyección aplica IVA por categoría (×1.19), no acá.
    expect(call.data.amount).toBe(100_000);
    expect(call.data.source).toBe("RECURRING_DTE");
    expect(call.data.sourceRefId).toBe("tpl-1");
    expect(call.data.kind).toBe("INCOME");
    expect(call.data.recurrence).toBe("MONTHLY");
    expect(call.data.dayOfMonth).toBe(5);
  });

  it("template currency CLP pero líneas UF: crea ítem en UF con unitPriceUf", async () => {
    (prisma.financeDteRecurringTemplate.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeTpl({
        currency: "CLP",
        lines: [
          {
            quantity: 1,
            unitPrice: 0,
            unitPriceUf: 435,
            priceCurrency: "UF",
            discountPct: 0,
          },
        ],
      }),
    );
    (prisma.financeCashflowItem.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.financeCashflowItem.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "x" });

    await syncRecurringDteItem(TENANT, "tpl-clp-uf-lines");
    const call = (prisma.financeCashflowItem.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.data.amount).toBe(435);
    expect(call.data.currency).toBe("UF");
  });

  it("plantilla UF: amount en UF neto vía unitPriceUf (no mezcla con unitPrice CLP)", async () => {
    (prisma.financeDteRecurringTemplate.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeTpl({
        currency: "UF",
        lines: [{ quantity: 1, unitPriceUf: 141, unitPrice: 0, discountPct: 0 }],
      }),
    );
    (prisma.financeCashflowItem.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.financeCashflowItem.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "x" });

    await syncRecurringDteItem(TENANT, "tpl-uf");
    const call = (prisma.financeCashflowItem.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.data.amount).toBe(141);
    expect(call.data.currency).toBe("UF");
  });

  it("frequency=weekly mapea a recurrence=WEEKLY con dayOfWeek", async () => {
    (prisma.financeDteRecurringTemplate.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeTpl({ frequency: "weekly", dayOfWeek: 3, dayOfMonth: null }),
    );
    (prisma.financeCashflowItem.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.financeCashflowItem.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "x" });

    await syncRecurringDteItem(TENANT, "tpl-1");
    const call = (prisma.financeCashflowItem.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.data.recurrence).toBe("WEEKLY");
    expect(call.data.dayOfWeek).toBe(3);
    expect(call.data.dayOfMonth).toBeNull();
  });

  it("desactiva item cuando template pasa a isActive=false", async () => {
    (prisma.financeDteRecurringTemplate.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeTpl({ isActive: false }),
    );
    (prisma.financeCashflowItem.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "i1",
      isActive: true,
    });
    (prisma.financeCashflowItem.update as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "x" });

    const r = await syncRecurringDteItem(TENANT, "tpl-1");
    expect(r.action).toBe("deactivated");
  });

  it("multi-tenant safety: template de otro tenant → noop", async () => {
    (prisma.financeDteRecurringTemplate.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const r = await syncRecurringDteItem("tenant-other", "tpl-1");
    expect(r.action).toBe("noop");
    expect(prisma.financeCashflowItem.create).not.toHaveBeenCalled();
  });

  it("si contractDocumentId apunta a documento inexistente, desactiva plantilla y espejo", async () => {
    (prisma.financeDteRecurringTemplate.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeTpl({ contractDocumentId: "doc-missing" }),
    );
    (prisma.document.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const txTemplateUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const txItemFindMany = vi.fn().mockResolvedValue([{ id: "it1" }]);
    const txItemUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const txOccDeleteMany = vi.fn().mockResolvedValue({ count: 0 });
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (fn: (tx: Record<string, unknown>) => Promise<unknown>) =>
        fn({
          financeDteRecurringTemplate: { updateMany: txTemplateUpdateMany },
          financeCashflowItem: {
            findMany: txItemFindMany,
            updateMany: txItemUpdateMany,
          },
          financeCashflowOccurrence: { deleteMany: txOccDeleteMany },
        }),
    );

    const r = await syncRecurringDteItem(TENANT, "tpl-1");
    expect(r.action).toBe("deactivated");
    expect(txTemplateUpdateMany).toHaveBeenCalled();
    expect(txItemUpdateMany).toHaveBeenCalled();
    expect(prisma.financeCashflowItem.create).not.toHaveBeenCalled();
  });
});

describe("backfillRecurringDteItems", () => {
  it("recorre todos los templates del tenant", async () => {
    (prisma.financeDteRecurringTemplate.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "t1" },
      { id: "t2" },
    ]);
    (prisma.financeDteRecurringTemplate.findFirst as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ where }: any) => makeTpl({ id: where.id }),
    );
    (prisma.financeCashflowItem.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.financeCashflowItem.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "x" });

    const stats = await backfillRecurringDteItems(TENANT);
    expect(stats.created).toBe(2);
  });
});

describe("syncRecurringDteItem — facturaTiming → espejo", () => {
  type Mock = ReturnType<typeof vi.fn>;

  beforeEach(() => {
    (prisma.financeCashflowCategory.findFirst as Mock).mockResolvedValue({ id: "cat-1" });
    (prisma.financeCashflowItem.findFirst as Mock).mockResolvedValue(null);
    (prisma.financeCashflowItem.create as Mock).mockResolvedValue({ id: "item-1" });
  });

  it("AL_EMITIR: espejo sin calendario → la cuota cae el día de la programación", async () => {
    (prisma.financeDteRecurringTemplate.findFirst as Mock).mockResolvedValue(
      makeTpl({
        dayOfMonth: 20,
        facturaTiming: "AL_EMITIR",
        facturaDay: null,
        facturaMesRelativo: "MES_SIGUIENTE",
      }),
    );

    await syncRecurringDteItem(TENANT, "tpl-1");

    const { data } = (prisma.financeCashflowItem.create as Mock).mock.calls[0][0];
    expect(data.dayOfMonth).toBe(20);
    expect(data.diaEmisionFactura).toBeNull();
    expect(data.mesFacturaRelativo).toBe("MISMO_MES");
    // El timing nunca toca el cobro.
    expect(data.diasCobroDesdeFactura).toBe(0);
    expect(data.emiteProforma).toBe(false);
  });

  it("DIA_ESPECIFICO: mapea facturaDay/facturaMesRelativo al calendario del espejo", async () => {
    (prisma.financeDteRecurringTemplate.findFirst as Mock).mockResolvedValue(
      makeTpl({
        dayOfMonth: 20,
        facturaTiming: "DIA_ESPECIFICO",
        facturaDay: 1,
        facturaMesRelativo: "MES_SIGUIENTE",
      }),
    );

    await syncRecurringDteItem(TENANT, "tpl-1");

    const { data } = (prisma.financeCashflowItem.create as Mock).mock.calls[0][0];
    // dayOfMonth sigue siendo el día de la programación (cuando corre el cron).
    expect(data.dayOfMonth).toBe(20);
    expect(data.diaEmisionFactura).toBe(1);
    expect(data.mesFacturaRelativo).toBe("MES_SIGUIENTE");
    expect(data.diasCobroDesdeFactura).toBe(0);
    expect(data.diaEmisionProforma).toBeNull();
    expect(data.diasFacturaDesdeProforma).toBeNull();
  });

  it("DIA_ESPECIFICO sin facturaDay: cae a 1", async () => {
    (prisma.financeDteRecurringTemplate.findFirst as Mock).mockResolvedValue(
      makeTpl({ facturaTiming: "DIA_ESPECIFICO", facturaDay: null, facturaMesRelativo: "MISMO_MES" }),
    );

    await syncRecurringDteItem(TENANT, "tpl-1");

    const { data } = (prisma.financeCashflowItem.create as Mock).mock.calls[0][0];
    expect(data.diaEmisionFactura).toBe(1);
  });

  it("needsUpdate: cambiar facturaDay limpia las cuotas PROYECTADAS viejas", async () => {
    (prisma.financeDteRecurringTemplate.findFirst as Mock).mockResolvedValue(
      makeTpl({
        dayOfMonth: 20,
        facturaTiming: "DIA_ESPECIFICO",
        facturaDay: 5,
        facturaMesRelativo: "MES_SIGUIENTE",
      }),
    );
    // Espejo existente con el timing anterior (día 1).
    (prisma.financeCashflowItem.findFirst as Mock).mockResolvedValue({
      id: "item-1",
      isActive: true,
      recurrence: "MONTHLY",
      dayOfMonth: 20,
      dayOfWeek: null,
      monthOfYear: null,
      diaEmisionFactura: 1,
      mesFacturaRelativo: "MES_SIGUIENTE",
      startDate: new Date("2026-01-01"),
      endDate: null,
    });

    await syncRecurringDteItem(TENANT, "tpl-1");

    expect(prisma.financeCashflowOccurrence.deleteMany).toHaveBeenCalledTimes(1);
    const delArg = (prisma.financeCashflowOccurrence.deleteMany as Mock).mock.calls[0][0];
    expect(delArg.where).toMatchObject({
      tenantId: TENANT,
      itemId: "item-1",
      status: "PROJECTED",
      dteId: null,
      bankTransactionId: null,
    });
    const updArg = (prisma.financeCashflowItem.update as Mock).mock.calls[0][0];
    expect(updArg.data.diaEmisionFactura).toBe(5);
  });

  it("needsUpdate: sin cambios de timing NO borra cuotas", async () => {
    (prisma.financeDteRecurringTemplate.findFirst as Mock).mockResolvedValue(
      makeTpl({
        dayOfMonth: 20,
        facturaTiming: "DIA_ESPECIFICO",
        facturaDay: 1,
        facturaMesRelativo: "MES_SIGUIENTE",
      }),
    );
    (prisma.financeCashflowItem.findFirst as Mock).mockResolvedValue({
      id: "item-1",
      isActive: true,
      recurrence: "MONTHLY",
      dayOfMonth: 20,
      dayOfWeek: null,
      monthOfYear: null,
      diaEmisionFactura: 1,
      mesFacturaRelativo: "MES_SIGUIENTE",
      startDate: new Date("2026-01-01"),
      endDate: null,
    });

    await syncRecurringDteItem(TENANT, "tpl-1");

    expect(prisma.financeCashflowOccurrence.deleteMany).not.toHaveBeenCalled();
  });
});
