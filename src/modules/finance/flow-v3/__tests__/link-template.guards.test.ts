import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const findDte = vi.fn();
const findTpl = vi.fn();
const updateDte = vi.fn();
const countDte = vi.fn();
const findAccounts = vi.fn();

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
  },
}));

import { linkDteToTemplate } from "../link-template.service";

describe("linkDteToTemplate — guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    countDte.mockResolvedValue(0);
    updateDte.mockResolvedValue({});
  });

  it("rechaza template de otra cuenta", async () => {
    findDte.mockResolvedValue({
      id: "d1", crmAccountId: "acc-A", receiverRut: null,
      date: new Date("2026-08-05T00:00:00.000Z"),
      recurringTemplateId: null, billingPeriod: null, dteType: 33,
    });
    findTpl.mockResolvedValue({
      id: "tpl-B", crmAccountId: "acc-B", receiverRut: null,
      frequency: "monthly", dayOfMonth: 5, dayOfWeek: null, monthOfYear: null,
      startDate: new Date("2026-01-05T00:00:00.000Z"), endDate: null, lastRunAt: null,
      facturaTiming: "AL_EMITIR", facturaDay: null, facturaMesRelativo: "MISMO_MES",
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
    findTpl.mockResolvedValue({
      id: "tpl-A", crmAccountId: "acc-A", receiverRut: null,
      frequency: "monthly", dayOfMonth: 5, dayOfWeek: null, monthOfYear: null,
      startDate: new Date("2026-01-05T00:00:00.000Z"), endDate: null, lastRunAt: null,
      facturaTiming: "AL_EMITIR", facturaDay: null, facturaMesRelativo: "MISMO_MES",
    });
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
    findTpl.mockResolvedValue({
      id: "tpl-A", crmAccountId: "acc-A", receiverRut: null,
      frequency: "monthly", dayOfMonth: 5, dayOfWeek: null, monthOfYear: null,
      startDate: new Date("2026-01-05T00:00:00.000Z"), endDate: null, lastRunAt: null,
      facturaTiming: "AL_EMITIR", facturaDay: null, facturaMesRelativo: "MISMO_MES",
    });
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
    findTpl.mockResolvedValue({
      id: "tpl-A", crmAccountId: "acc-A", receiverRut: null,
      frequency: "monthly", dayOfMonth: 5, dayOfWeek: null, monthOfYear: null,
      startDate: new Date("2026-01-05T00:00:00.000Z"), endDate: null, lastRunAt: null,
      facturaTiming: "AL_EMITIR", facturaDay: null, facturaMesRelativo: "MISMO_MES",
    });
    await expect(linkDteToTemplate("t1", "d1", "tpl-A")).rejects.toThrow(
      /otra programación/i,
    );
  });
});
