import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const findMany = vi.fn();
const findFirst = vi.fn();
const count = vi.fn();
const findDteFirst = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    financeDteRecurringTemplate: {
      findMany: (...a: unknown[]) => findMany(...a),
      findFirst: (...a: unknown[]) => findFirst(...a),
      count: (...a: unknown[]) => count(...a),
    },
    financeDte: {
      findFirst: (...a: unknown[]) => findDteFirst(...a),
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

describe("applyTemplateLinkInheritance — destino v4.3/v4.7", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findFirst.mockResolvedValue(null);
    findDteFirst.mockResolvedValue(null);
  });

  it("con 2+ programaciones y sin vínculo → rechaza con opciones", async () => {
    findMany
      .mockResolvedValueOnce([]) // herencia (take 2) no aplica cuando null explícito… no se llama
      .mockResolvedValueOnce([
        { id: "tpl-a", name: "20%", installationId: null },
        { id: "tpl-b", name: "80%", installationId: null },
      ]);
    // Con null explícito no corre herencia (solo undefined). Solo listActive.
    findMany.mockReset();
    findMany.mockResolvedValue([
      { id: "tpl-a", name: "20%", installationId: null },
      { id: "tpl-b", name: "80%", installationId: null },
    ]);

    await expect(
      applyTemplateLinkInheritance("t1", {
        dteType: 33,
        crmAccountId: "acc-A",
        issueDateYmd: "2026-08-05",
        recurringTemplateId: null,
        billingPeriod: null,
      }),
    ).rejects.toMatchObject({
      name: "TemplateLinkRequiredError",
      code: "TEMPLATE_LINK_REQUIRED",
      options: [
        { id: "tpl-a", name: "20%" },
        { id: "tpl-b", name: "80%" },
      ],
    });
  });

  it("template de otra cuenta se trata como ausente y exige selector si hay 2+", async () => {
    findFirst.mockResolvedValue(null); // no pertenece a la cuenta
    findMany.mockResolvedValue([
      { id: "tpl-a", name: "20%", installationId: null },
      { id: "tpl-b", name: "80%", installationId: null },
    ]);

    await expect(
      applyTemplateLinkInheritance("t1", {
        dteType: 33,
        crmAccountId: "acc-Transmat",
        issueDateYmd: "2026-08-05",
        recurringTemplateId: "tpl-east-west",
        billingPeriod: "2026-08",
      }),
    ).rejects.toBeInstanceOf(TemplateLinkRequiredError);
  });

  it("con 2+ programaciones y template elegido (extra, período nulo) → ok", async () => {
    findFirst.mockResolvedValue({ id: "tpl-1" });
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
  });

  it("con 2+ programaciones y cuota (template + período) → ok", async () => {
    findFirst.mockResolvedValue({ id: "tpl-2" });
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
    findMany.mockResolvedValue([
      { id: "tpl-only", name: "Única", installationId: null },
    ]);
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
    findFirst.mockResolvedValue({ id: "tpl-only" });
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
  });

  it("con 0 programaciones y sin vínculo → permitido (bandeja)", async () => {
    findMany.mockResolvedValue([]);
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
    expect(findMany).not.toHaveBeenCalled();
  });

  it("flujos automáticos con vínculo explícito no listan si pertenece", async () => {
    findFirst.mockResolvedValue({ id: "tpl-auto" });
    const out = await applyTemplateLinkInheritance("t1", {
      dteType: 33,
      crmAccountId: "acc-A",
      issueDateYmd: "2026-08-05",
      recurringTemplateId: "tpl-auto",
      billingPeriod: "2026-08",
    });
    expect(out.recurringTemplateId).toBe("tpl-auto");
    expect(findMany).not.toHaveBeenCalled();
  });

  it("v4.8: 2+ programaciones + installationId inequívoco → hereda esa fila", async () => {
    const schedule = {
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
    };
    findMany.mockResolvedValue([
      { id: "tpl-pemuco", installationId: "inst-pemuco", ...schedule },
      { id: "tpl-llay", installationId: "inst-llay", ...schedule },
    ]);
    findFirst.mockResolvedValue({ id: "tpl-llay" });

    const out = await applyTemplateLinkInheritance("t1", {
      dteType: 33,
      crmAccountId: "acc-Pine",
      installationId: "inst-llay",
      issueDateYmd: "2026-08-05",
      // undefined → heredar (caso duplicar factura sin vínculo previo)
    });
    expect(out).toEqual({
      recurringTemplateId: "tpl-llay",
      billingPeriod: "2026-08",
    });
  });

  it("v4.8: 2+ programaciones sin installationId → sigue exigiendo selector", async () => {
    findMany
      .mockResolvedValueOnce([
        {
          id: "tpl-pemuco",
          installationId: "inst-pemuco",
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
        {
          id: "tpl-llay",
          installationId: "inst-llay",
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
      ])
      .mockResolvedValueOnce([
        { id: "tpl-pemuco", name: "Pine - Pemuco", installationId: "inst-pemuco" },
        { id: "tpl-llay", name: "Pine - Llay Llay", installationId: "inst-llay" },
      ]);

    await expect(
      applyTemplateLinkInheritance("t1", {
        dteType: 33,
        crmAccountId: "acc-Pine",
        issueDateYmd: "2026-08-05",
      }),
    ).rejects.toBeInstanceOf(TemplateLinkRequiredError);
  });

  it("v4.8b: null explícito + installationId inequívoco → hereda (emitir borrador)", async () => {
    const schedule = {
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
    };
    // resolveDefaultTemplateLink (antes del throw): lista con schedule fields
    findMany.mockResolvedValue([
      { id: "tpl-pemuco", installationId: "inst-pemuco", ...schedule },
      { id: "tpl-llay", installationId: "inst-llay", ...schedule },
    ]);

    const out = await applyTemplateLinkInheritance("t1", {
      dteType: 33,
      crmAccountId: "acc-Pine",
      installationId: "inst-llay",
      issueDateYmd: "2026-08-05",
      recurringTemplateId: null, // form sin selector / payload vacío
      billingPeriod: null,
    });
    expect(out).toEqual({
      recurringTemplateId: "tpl-llay",
      billingPeriod: "2026-08",
    });
  });

  it("v4.8: installationId que no matchea ninguna fila → exige selector", async () => {
    findMany
      .mockResolvedValueOnce([
        {
          id: "tpl-a",
          installationId: "inst-a",
          frequency: "monthly",
          dayOfMonth: 1,
          dayOfWeek: null,
          monthOfYear: null,
          startDate: new Date("2026-01-01"),
          endDate: null,
          lastRunAt: null,
          facturaTiming: "AL_EMITIR",
          facturaDay: null,
          facturaMesRelativo: "MISMO_MES",
        },
        {
          id: "tpl-b",
          installationId: "inst-b",
          frequency: "monthly",
          dayOfMonth: 1,
          dayOfWeek: null,
          monthOfYear: null,
          startDate: new Date("2026-01-01"),
          endDate: null,
          lastRunAt: null,
          facturaTiming: "AL_EMITIR",
          facturaDay: null,
          facturaMesRelativo: "MISMO_MES",
        },
      ])
      .mockResolvedValueOnce([
        { id: "tpl-a", name: "A", installationId: "inst-a" },
        { id: "tpl-b", name: "B", installationId: "inst-b" },
      ]);

    await expect(
      applyTemplateLinkInheritance("t1", {
        dteType: 33,
        crmAccountId: "acc-A",
        installationId: "inst-otra",
        issueDateYmd: "2026-08-05",
      }),
    ).rejects.toBeInstanceOf(TemplateLinkRequiredError);
  });

  it("template inactivo de la misma cuenta se conserva (no hereda la hermana activa)", async () => {
    findFirst.mockResolvedValue({ id: "tpl-poetas" });
    const out = await applyTemplateLinkInheritance("t1", {
      dteType: 33,
      crmAccountId: "acc-Ametel",
      installationId: "inst-poetas",
      issueDateYmd: "2026-09-01",
      recurringTemplateId: "tpl-poetas",
      billingPeriod: "2026-09",
    });
    expect(out).toEqual({
      recurringTemplateId: "tpl-poetas",
      billingPeriod: "2026-09",
    });
    expect(findMany).not.toHaveBeenCalled();
  });

  it("herencia automática no ocupa una cuota ya cubierta por borrador/F°", async () => {
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
    findFirst.mockResolvedValue({ id: "tpl-only" });
    findDteFirst.mockResolvedValue({ id: "draft-ya-existe" });

    const out = await applyTemplateLinkInheritance("t1", {
      dteType: 33,
      crmAccountId: "acc-A",
      issueDateYmd: "2026-08-05",
    });
    expect(out).toEqual({
      recurringTemplateId: null,
      billingPeriod: null,
    });
    expect(findDteFirst).toHaveBeenCalled();
  });

  it("duplicate-as-draft con período explícito no se desvincula aunque la cuota esté cubierta", async () => {
    findFirst.mockResolvedValue({ id: "tpl-only" });
    findDteFirst.mockResolvedValue({ id: "dte-voided-sibling" });
    const out = await applyTemplateLinkInheritance("t1", {
      dteType: 33,
      crmAccountId: "acc-A",
      issueDateYmd: "2026-08-05",
      recurringTemplateId: "tpl-only",
      billingPeriod: "2026-08",
    });
    expect(out).toEqual({
      recurringTemplateId: "tpl-only",
      billingPeriod: "2026-08",
    });
    expect(findDteFirst).not.toHaveBeenCalled();
  });
});
