import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const findDte = vi.fn();
const findTpl = vi.fn();
const updateDte = vi.fn();
const countDte = vi.fn();
const findAccounts = vi.fn();

const tx = {
  financeDte: {
    findFirst: (...a: unknown[]) => findDte(...a),
    update: (...a: unknown[]) => updateDte(...a),
    count: (...a: unknown[]) => countDte(...a),
  },
  financeDteRecurringTemplate: {
    findFirst: (...a: unknown[]) => findTpl(...a),
  },
  crmAccount: {
    findMany: (...a: unknown[]) => findAccounts(...a),
  },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    financeDte: {
      findFirst: (...a: unknown[]) => findDte(...a),
      update: (...a: unknown[]) => updateDte(...a),
      count: (...a: unknown[]) => countDte(...a),
    },
    financeDteRecurringTemplate: {
      findFirst: (...a: unknown[]) => findTpl(...a),
      findMany: vi.fn(),
    },
    crmAccount: {
      findMany: (...a: unknown[]) => findAccounts(...a),
    },
    $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  },
}));

import { linkDteToTemplate, linkDtesToTemplateBulk } from "../link-template.service";

const TPL_A = {
  id: "tpl-A", crmAccountId: "acc-A", receiverRut: null,
  frequency: "monthly", dayOfMonth: 5, dayOfWeek: null, monthOfYear: null,
  startDate: new Date("2026-01-05T00:00:00.000Z"), endDate: null, lastRunAt: null,
  facturaTiming: "AL_EMITIR", facturaDay: null, facturaMesRelativo: "MISMO_MES",
};

describe("linkDteToTemplate — guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    countDte.mockResolvedValue(0);
    updateDte.mockResolvedValue({});
    findAccounts.mockResolvedValue([]);
  });

  it("rechaza template de otra cuenta", async () => {
    findDte.mockResolvedValue({
      id: "d1", crmAccountId: "acc-A", receiverRut: null,
      date: new Date("2026-08-05T00:00:00.000Z"),
      recurringTemplateId: null, billingPeriod: null, dteType: 33,
    });
    findTpl.mockResolvedValue({
      ...TPL_A, id: "tpl-B", crmAccountId: "acc-B",
    });
    await expect(linkDteToTemplate("t1", "d1", "tpl-B")).rejects.toThrow(
      /misma cuenta/i,
    );
    expect(updateDte).not.toHaveBeenCalled();
  });

  it("vincula y setea billingPeriod del calendario", async () => {
    findDte.mockResolvedValue({
      id: "d1", crmAccountId: "acc-A", receiverRut: null,
      date: new Date("2026-08-05T00:00:00.000Z"),
      recurringTemplateId: null, billingPeriod: null, dteType: 33,
    });
    findTpl.mockResolvedValue(TPL_A);
    const r = await linkDteToTemplate("t1", "d1", "tpl-A");
    expect(r.billingPeriod).toBe("2026-08");
    expect(r.noop).toBe(false);
    expect(updateDte).toHaveBeenCalledWith({
      where: { id: "d1" },
      data: {
        recurringTemplateId: "tpl-A",
        billingPeriod: "2026-08",
        crmAccountId: "acc-A",
      },
    });
  });

  it("idempotente si ya está al mismo template+período", async () => {
    findDte.mockResolvedValue({
      id: "d1", crmAccountId: "acc-A", receiverRut: null,
      date: new Date("2026-08-05T00:00:00.000Z"),
      recurringTemplateId: "tpl-A", billingPeriod: "2026-08", dteType: 33,
    });
    findTpl.mockResolvedValue(TPL_A);
    const r = await linkDteToTemplate("t1", "d1", "tpl-A");
    expect(r.noop).toBe(true);
    expect(updateDte).not.toHaveBeenCalled();
  });

  it("rechaza sobrescribir vínculo distinto", async () => {
    findDte.mockResolvedValue({
      id: "d1", crmAccountId: "acc-A", receiverRut: null,
      date: new Date("2026-08-05T00:00:00.000Z"),
      recurringTemplateId: "tpl-OLD", billingPeriod: "2026-07", dteType: 33,
    });
    findTpl.mockResolvedValue(TPL_A);
    await expect(linkDteToTemplate("t1", "d1", "tpl-A")).rejects.toThrow(
      /otra programación/i,
    );
  });
});

describe("linkDtesToTemplateBulk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    countDte.mockResolvedValue(0);
    updateDte.mockResolvedValue({});
    findAccounts.mockResolvedValue([]);
    findTpl.mockResolvedValue(TPL_A);
  });

  it("vincula N con período correcto por factura", async () => {
    findDte
      .mockResolvedValueOnce({
        id: "d1", crmAccountId: "acc-A", receiverRut: null,
        date: new Date("2026-07-05T00:00:00.000Z"),
        recurringTemplateId: null, billingPeriod: null, dteType: 33,
      })
      .mockResolvedValueOnce({
        id: "d2", crmAccountId: "acc-A", receiverRut: null,
        date: new Date("2026-08-05T00:00:00.000Z"),
        recurringTemplateId: null, billingPeriod: null, dteType: 33,
      });

    const r = await linkDtesToTemplateBulk("t1", ["d1", "d2"], "tpl-A");
    expect(r.linked).toHaveLength(2);
    expect(r.skipped).toHaveLength(0);
    expect(r.linked[0]).toMatchObject({
      dteId: "d1", billingPeriod: "2026-07", noop: false,
    });
    expect(r.linked[1]).toMatchObject({
      dteId: "d2", billingPeriod: "2026-08", noop: false,
    });
    expect(updateDte).toHaveBeenCalledTimes(2);
  });

  it("omite ya vinculados a otra programación (no pisa)", async () => {
    findDte
      .mockResolvedValueOnce({
        id: "d1", crmAccountId: "acc-A", receiverRut: null,
        date: new Date("2026-08-05T00:00:00.000Z"),
        recurringTemplateId: "tpl-OLD", billingPeriod: "2026-07", dteType: 33,
      })
      .mockResolvedValueOnce({
        id: "d2", crmAccountId: "acc-A", receiverRut: null,
        date: new Date("2026-08-05T00:00:00.000Z"),
        recurringTemplateId: null, billingPeriod: null, dteType: 33,
      });

    const r = await linkDtesToTemplateBulk("t1", ["d1", "d2"], "tpl-A");
    expect(r.skipped).toEqual([
      { dteId: "d1", reason: "Ya vinculado a otra programación" },
    ]);
    expect(r.linked).toHaveLength(1);
    expect(r.linked[0]!.dteId).toBe("d2");
    expect(updateDte).toHaveBeenCalledTimes(1);
  });

  it("rechaza DTE de otra cuenta (aborta lote)", async () => {
    findDte.mockResolvedValueOnce({
      id: "d1", crmAccountId: "acc-B", receiverRut: null,
      date: new Date("2026-08-05T00:00:00.000Z"),
      recurringTemplateId: null, billingPeriod: null, dteType: 33,
    });
    await expect(
      linkDtesToTemplateBulk("t1", ["d1"], "tpl-A"),
    ).rejects.toThrow(/misma cuenta/i);
    expect(updateDte).not.toHaveBeenCalled();
  });

  it("idempotente: mismo template+período → noop", async () => {
    findDte.mockResolvedValueOnce({
      id: "d1", crmAccountId: "acc-A", receiverRut: null,
      date: new Date("2026-08-05T00:00:00.000Z"),
      recurringTemplateId: "tpl-A", billingPeriod: "2026-08", dteType: 33,
    });
    const r = await linkDtesToTemplateBulk("t1", ["d1"], "tpl-A");
    expect(r.linked[0]?.noop).toBe(true);
    expect(updateDte).not.toHaveBeenCalled();
  });
});
