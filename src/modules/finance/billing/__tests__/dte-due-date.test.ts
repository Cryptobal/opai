import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const templateFindFirst = vi.fn();
const configFindUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    financeDteRecurringTemplate: {
      findFirst: (...a: unknown[]) => templateFindFirst(...a),
    },
    financeCashflowConfig: {
      findUnique: (...a: unknown[]) => configFindUnique(...a),
    },
  },
}));

import {
  DEFAULT_DUE_DATE_LAG_DAYS,
  computeDueDateYmd,
  pickDueDateDays,
  resolveDueDate,
  resolveIssuedDueDate,
} from "../dte-due-date";

describe("pickDueDateDays — cascada del término de pago", () => {
  it("explícito gana sobre contrato y tenant", () => {
    expect(
      pickDueDateDays({ explicitDays: 7, templateDays: 45, tenantLagDays: 60 }),
    ).toEqual({ days: 7, source: "explicit" });
  });

  it("sin explícito usa el término del contrato", () => {
    expect(
      pickDueDateDays({ explicitDays: null, templateDays: 45, tenantLagDays: 60 }),
    ).toEqual({ days: 45, source: "template" });
  });

  it("sin contrato usa el default del tenant", () => {
    expect(
      pickDueDateDays({ templateDays: null, tenantLagDays: 60 }),
    ).toEqual({ days: 60, source: "tenant" });
  });

  it("sin nada cae a 30 días", () => {
    expect(pickDueDateDays({})).toEqual({
      days: DEFAULT_DUE_DATE_LAG_DAYS,
      source: "default",
    });
    expect(DEFAULT_DUE_DATE_LAG_DAYS).toBe(30);
  });

  it("0 es término válido (cobro contra entrega), no cae al siguiente nivel", () => {
    expect(
      pickDueDateDays({ templateDays: 0, tenantLagDays: 60 }),
    ).toEqual({ days: 0, source: "template" });
    expect(
      pickDueDateDays({ explicitDays: 0, templateDays: 45 }),
    ).toEqual({ days: 0, source: "explicit" });
  });

  it("valores inválidos (negativos / no enteros) se ignoran", () => {
    expect(
      pickDueDateDays({ explicitDays: -5, templateDays: 45 }),
    ).toEqual({ days: 45, source: "template" });
    expect(
      pickDueDateDays({ templateDays: 12.5, tenantLagDays: 60 }),
    ).toEqual({ days: 60, source: "tenant" });
    expect(
      pickDueDateDays({ templateDays: Number.NaN, tenantLagDays: null }),
    ).toEqual({ days: DEFAULT_DUE_DATE_LAG_DAYS, source: "default" });
  });
});

describe("computeDueDateYmd — aritmética de fechas", () => {
  it("suma días cruzando fin de mes", () => {
    expect(computeDueDateYmd("2026-08-06", 30)).toBe("2026-09-05");
  });

  it("suma días cruzando fin de año", () => {
    expect(computeDueDateYmd("2026-12-20", 30)).toBe("2027-01-19");
  });

  it("respeta año bisiesto", () => {
    expect(computeDueDateYmd("2028-02-01", 30)).toBe("2028-03-02");
  });

  it("con 0 días el vencimiento es la emisión", () => {
    expect(computeDueDateYmd("2026-08-06", 0)).toBe("2026-08-06");
  });
});

describe("resolveDueDate — lookups", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    templateFindFirst.mockResolvedValue(null);
    configFindUnique.mockResolvedValue(null);
  });

  it("con explicitDays no consulta BD", async () => {
    const out = await resolveDueDate({
      tenantId: "t1",
      issueDateYmd: "2026-08-06",
      explicitDays: 15,
      recurringTemplateId: "tpl-1",
    });
    expect(out).toEqual({
      dueDateYmd: "2026-08-21",
      days: 15,
      source: "explicit",
    });
    expect(templateFindFirst).not.toHaveBeenCalled();
    expect(configFindUnique).not.toHaveBeenCalled();
  });

  it("con templateDays en mano no consulta la programación", async () => {
    const out = await resolveDueDate({
      tenantId: "t1",
      issueDateYmd: "2026-08-06",
      templateDays: 45,
      recurringTemplateId: "tpl-1",
    });
    expect(out).toEqual({
      dueDateYmd: "2026-09-20",
      days: 45,
      source: "template",
    });
    expect(templateFindFirst).not.toHaveBeenCalled();
  });

  it("lee diasCobroDesdeFactura de la programación vinculada", async () => {
    templateFindFirst.mockResolvedValue({ diasCobroDesdeFactura: 60 });
    const out = await resolveDueDate({
      tenantId: "t1",
      issueDateYmd: "2026-08-06",
      recurringTemplateId: "tpl-1",
    });
    expect(out.days).toBe(60);
    expect(out.source).toBe("template");
    expect(out.dueDateYmd).toBe("2026-10-05");
    expect(configFindUnique).not.toHaveBeenCalled();
    expect(templateFindFirst).toHaveBeenCalledWith({
      where: { id: "tpl-1", tenantId: "t1" },
      select: { diasCobroDesdeFactura: true },
    });
  });

  it("programación sin término cae al default del tenant", async () => {
    templateFindFirst.mockResolvedValue({ diasCobroDesdeFactura: null });
    configFindUnique.mockResolvedValue({ collectionLagDays: 20 });
    const out = await resolveDueDate({
      tenantId: "t1",
      issueDateYmd: "2026-08-06",
      recurringTemplateId: "tpl-1",
    });
    expect(out).toEqual({
      dueDateYmd: "2026-08-26",
      days: 20,
      source: "tenant",
    });
  });

  it("sin programación ni config cae a 30 días", async () => {
    const out = await resolveDueDate({
      tenantId: "t1",
      issueDateYmd: "2026-08-06",
    });
    expect(out).toEqual({
      dueDateYmd: "2026-09-05",
      days: 30,
      source: "default",
    });
  });
});

describe("resolveIssuedDueDate — valor persistido", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    templateFindFirst.mockResolvedValue(null);
    configFindUnique.mockResolvedValue(null);
  });

  it("respeta el vencimiento explícito del borrador/form", async () => {
    const out = await resolveIssuedDueDate({
      tenantId: "t1",
      dteType: 33,
      emissionYmd: "2026-08-06",
      explicitDueDate: "2026-11-30",
    });
    expect(out).not.toBeNull();
    expect(out!.toISOString().slice(0, 10)).toBe("2026-11-30");
    expect(configFindUnique).not.toHaveBeenCalled();
  });

  it("con vencimiento malformado no rompe: cae a la cascada", async () => {
    configFindUnique.mockResolvedValue({ collectionLagDays: 10 });
    const out = await resolveIssuedDueDate({
      tenantId: "t1",
      dteType: 33,
      emissionYmd: "2026-08-06",
      explicitDueDate: "no-es-fecha",
    });
    expect(out!.toISOString().slice(0, 10)).toBe("2026-08-16");
  });

  it("estampa vencimiento derivado cuando el form no lo trae", async () => {
    const out = await resolveIssuedDueDate({
      tenantId: "t1",
      dteType: 33,
      emissionYmd: "2026-08-06",
    });
    expect(out!.toISOString().slice(0, 10)).toBe("2026-09-05");
  });

  it("nota de crédito (61) nace sin vencimiento", async () => {
    const out = await resolveIssuedDueDate({
      tenantId: "t1",
      dteType: 61,
      emissionYmd: "2026-08-06",
      explicitDueDate: "2026-09-05",
    });
    expect(out).toBeNull();
  });

  it("nota de débito (56) sí lleva vencimiento (es cobrable)", async () => {
    const out = await resolveIssuedDueDate({
      tenantId: "t1",
      dteType: 56,
      emissionYmd: "2026-08-06",
    });
    expect(out!.toISOString().slice(0, 10)).toBe("2026-09-05");
  });
});
