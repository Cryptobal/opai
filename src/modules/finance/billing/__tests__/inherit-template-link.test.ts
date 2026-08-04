import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const findMany = vi.fn();
const count = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    financeDteRecurringTemplate: {
      findMany: (...a: unknown[]) => findMany(...a),
      count: (...a: unknown[]) => count(...a),
    },
  },
}));

vi.mock("../dte-recurring-schedule", () => ({
  resolveBillingPeriodForDate: () => "2026-08",
}));

import {
  applyTemplateLinkInheritance,
  TemplateLinkRequiredError,
} from "../inherit-template-link";

describe("applyTemplateLinkInheritance — destino v4.3", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("con 2+ programaciones y sin vínculo → rechaza", async () => {
    findMany.mockResolvedValue([]); // herencia no aplica (>1)
    count.mockResolvedValue(2);

    await expect(
      applyTemplateLinkInheritance("t1", {
        dteType: 33,
        crmAccountId: "acc-A",
        issueDateYmd: "2026-08-05",
        recurringTemplateId: null,
        billingPeriod: null,
      }),
    ).rejects.toBeInstanceOf(TemplateLinkRequiredError);
  });

  it("con 2+ programaciones y template elegido (extra, período nulo) → ok", async () => {
    const out = await applyTemplateLinkInheritance("t1", {
      dteType: 33,
      crmAccountId: "acc-A",
      issueDateYmd: "2026-08-05",
      recurringTemplateId: "tpl-1",
      billingPeriod: null,
    });
    expect(out).toEqual({
      recurringTemplateId: "tpl-1",
      billingPeriod: null,
    });
    expect(count).not.toHaveBeenCalled();
  });

  it("con 2+ programaciones y cuota (template + período) → ok", async () => {
    const out = await applyTemplateLinkInheritance("t1", {
      dteType: 33,
      crmAccountId: "acc-A",
      issueDateYmd: "2026-08-05",
      recurringTemplateId: "tpl-2",
      billingPeriod: "2026-08",
    });
    expect(out).toEqual({
      recurringTemplateId: "tpl-2",
      billingPeriod: "2026-08",
    });
  });

  it("con 1 programación y extra explícito (null) → permitido (bandeja o sin vínculo)", async () => {
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(1);
    // null explícito: no hereda; count=1 → no exige vínculo
    const out = await applyTemplateLinkInheritance("t1", {
      dteType: 33,
      crmAccountId: "acc-A",
      issueDateYmd: "2026-08-05",
      recurringTemplateId: null,
      billingPeriod: null,
    });
    expect(out.recurringTemplateId).toBeNull();
  });

  it("con 1 programación y undefined → hereda cuota", async () => {
    findMany.mockResolvedValue([
      {
        id: "tpl-only",
        frequency: "monthly",
        dayOfMonth: 5,
        dayOfWeek: null,
        monthOfYear: null,
        startDate: new Date("2026-01-01"),
        endDate: null,
        lastRunAt: null,
        facturaTiming: "AL_EMITIR",
        facturaDay: null,
        facturaMesRelativo: "MISMO_MES",
      },
    ]);
    const out = await applyTemplateLinkInheritance("t1", {
      dteType: 33,
      crmAccountId: "acc-A",
      issueDateYmd: "2026-08-05",
      // undefined → heredar
    });
    expect(out).toEqual({
      recurringTemplateId: "tpl-only",
      billingPeriod: "2026-08",
    });
    expect(count).not.toHaveBeenCalled();
  });

  it("con 0 programaciones y sin vínculo → permitido (bandeja)", async () => {
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);
    const out = await applyTemplateLinkInheritance("t1", {
      dteType: 33,
      crmAccountId: "acc-A",
      issueDateYmd: "2026-08-05",
      recurringTemplateId: null,
    });
    expect(out.recurringTemplateId).toBeNull();
  });

  it("tipos distintos de 33/34 no exigen vínculo", async () => {
    const out = await applyTemplateLinkInheritance("t1", {
      dteType: 61,
      crmAccountId: "acc-A",
      issueDateYmd: "2026-08-05",
      recurringTemplateId: null,
    });
    expect(out.recurringTemplateId).toBeNull();
    expect(count).not.toHaveBeenCalled();
  });

  it("flujos automáticos con vínculo explícito no consultan count", async () => {
    const out = await applyTemplateLinkInheritance("t1", {
      dteType: 33,
      crmAccountId: "acc-A",
      issueDateYmd: "2026-08-05",
      recurringTemplateId: "tpl-auto",
      billingPeriod: "2026-08",
    });
    expect(out.recurringTemplateId).toBe("tpl-auto");
    expect(findMany).not.toHaveBeenCalled();
    expect(count).not.toHaveBeenCalled();
  });
});
