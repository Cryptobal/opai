import { describe, it, expect } from "vitest";
import { deriveCommittedIncome, type TemplateProjectionInput } from "../derive-committed-income";
import { grossPerRunFromLines } from "../load-committed-income";
import { UNMATCHED_INCOME_KEY, type FlowRowRef } from "../types";
import { enumerateWeeks } from "../weeks";

const TODAY = "2026-07-21"; // martes → semana actual = lunes 2026-07-20
const WEEKS = enumerateWeeks(
  new Date(Date.UTC(2026, 5, 22)),
  new Date(Date.UTC(2026, 11, 28)),
);

const rowExact: FlowRowRef = {
  id: "row-a-i1", crmAccountId: "acc-A", installationId: "inst-1", categoryId: null, name: "Cliente A · Bodega",
};
const rowGeneric: FlowRowRef = {
  id: "row-a", crmAccountId: "acc-A", installationId: null, categoryId: null, name: "Cliente A",
};
const ROWS = [rowExact, rowGeneric];

function makeTemplate(over: Partial<TemplateProjectionInput> = {}): TemplateProjectionInput {
  return {
    id: "tpl-1", name: "Contrato A", crmAccountId: "acc-A", installationId: "inst-1",
    frequency: "monthly", dayOfMonth: 5, dayOfWeek: null, monthOfYear: null,
    startDate: new Date("2026-01-05"), endDate: new Date("2026-10-31"),
    lastRunAt: new Date("2026-07-05"), nextRunAt: new Date("2026-08-05"),
    facturaTiming: "AL_EMITIR", facturaDay: null, facturaMesRelativo: "MES_SIGUIENTE",
    grossPerRunClp: 500_000,
    ...over,
  };
}

const base = { rows: ROWS, weeks: WEEKS, todayYmd: TODAY, dtes: [], drafts: [], templates: [], coveredPeriods: new Set<string>() };

describe("deriveCommittedIncome — DTEs emitidos", () => {
  it("emitida no pagada cae en la semana de emisión (la factura manda)", () => {
    const out = deriveCommittedIncome({
      ...base,
      dtes: [{
        // Emisión en la semana actual del fixture; dueDate NO desplaza.
        id: "dte-1", folio: 101, dateYmd: "2026-07-21", dueDateYmd: "2026-08-20",
        pendingClp: 1_190_000, crmAccountId: "acc-A", installationId: "inst-1", receiverName: "Cliente A",
      }],
    });
    const cell = out.get("row-a-i1")?.get("2026-07-20");
    expect(cell?.total).toBe(1_190_000);
    expect(cell?.items[0]).toMatchObject({
      kind: "dte",
      folio: 101,
      dteId: "dte-1",
      fecha: "2026-07-21",
      emissionYmd: "2026-07-21",
      dueYmd: "2026-08-20",
    });
  });

  it("emisión pasada queda en su semana (sin arrastre); overdue usa dueDate/emisión+lag", () => {
    const out = deriveCommittedIncome({
      ...base,
      dtes: [{
        // Emisión en semana pasada dentro del horizonte (lunes 2026-06-22).
        id: "dte-2", folio: 90, dateYmd: "2026-06-25", dueDateYmd: null,
        pendingClp: 200_000, crmAccountId: "acc-A", installationId: "inst-1", receiverName: "Cliente A",
      }],
    });
    // v4.5: no se arrastra a la semana actual.
    expect(out.get("row-a-i1")?.get("2026-07-20")).toBeUndefined();
    expect(out.get("row-a-i1")?.get("2026-06-22")?.total).toBe(200_000);
    // 2026-06-25+30d = 2026-07-25 → aún no vencida vs TODAY 2026-07-21.
    expect(out.get("row-a-i1")?.get("2026-06-22")?.items[0]).toMatchObject({
      emissionYmd: "2026-06-25",
      dueYmd: "2026-07-25",
      overdueOver60: false,
      overdueDays: 0,
    });
  });

  it("emisión pasada fuera del horizonte no aparece en la semana actual", () => {
    const out = deriveCommittedIncome({
      ...base,
      dtes: [{
        id: "dte-old", folio: 91, dateYmd: "2026-04-01", dueDateYmd: null,
        pendingClp: 200_000, crmAccountId: "acc-A", installationId: "inst-1", receiverName: "Cliente A",
      }],
    });
    expect(out.get("row-a-i1")?.get("2026-07-20")).toBeUndefined();
    // Fuera de weeks → no entra en ninguna celda del rango.
    const all = [...(out.get("row-a-i1")?.values() ?? [])].flatMap((c) => c.items);
    expect(all.filter((i) => i.dteId === "dte-old")).toHaveLength(0);
  });

  it("override pasado también queda anclado (sin clamp); overdue >60d", () => {
    const out = deriveCommittedIncome({
      ...base,
      dtes: [{
        id: "dte-ov-past", folio: 92, dateYmd: "2026-07-21", dueDateYmd: "2026-04-01",
        overrideDateYmd: "2026-06-24",
        pendingClp: 150_000, crmAccountId: "acc-A", installationId: "inst-1", receiverName: "Cliente A",
      }],
    });
    expect(out.get("row-a-i1")?.get("2026-06-22")?.total).toBe(150_000);
    expect(out.get("row-a-i1")?.get("2026-07-20")).toBeUndefined();
    // dueDate 2026-04-01 → >60d vs TODAY.
    expect(out.get("row-a-i1")?.get("2026-06-22")?.items[0]?.overdueOver60).toBe(true);
  });

  it("override de visibilidad mueve la factura a otra semana", () => {
    const out = deriveCommittedIncome({
      ...base,
      dtes: [{
        id: "dte-ov", folio: 1789, dateYmd: "2026-08-03", dueDateYmd: null,
        overrideDateYmd: "2026-08-31",
        pendingClp: 5_200_768, crmAccountId: "acc-A", installationId: "inst-1", receiverName: "Ametel",
      }],
    });
    expect(out.get("row-a-i1")?.get("2026-08-31")?.total).toBe(5_200_768);
    expect(out.get("row-a-i1")?.get("2026-08-03")).toBeUndefined();
  });

  it("instalación sin fila exacta cae en la fila genérica de la cuenta; cuenta sin fila → unmatched", () => {
    const out = deriveCommittedIncome({
      ...base,
      dtes: [
        { id: "d3", folio: 1, dateYmd: "2026-07-21", dueDateYmd: "2026-08-20", pendingClp: 10, crmAccountId: "acc-A", installationId: "inst-otra", receiverName: "A" },
        { id: "d4", folio: 2, dateYmd: "2026-07-21", dueDateYmd: "2026-08-20", pendingClp: 20, crmAccountId: "acc-Z", installationId: null, receiverName: "Z" },
      ],
    });
    // Emisión 2026-07-21 → lunes 2026-07-20 (semana actual del fixture).
    expect(out.get("row-a")?.get("2026-07-20")?.total).toBe(10);
    expect(out.get(UNMATCHED_INCOME_KEY)?.get("2026-07-20")?.total).toBe(20);
  });

  it("1 programación = 1 fila: dos templates de la misma cuenta no se mezclan", () => {
    const rows: FlowRowRef[] = [
      {
        id: "row-20", name: "Transmat 20%", crmAccountId: "acc-T", installationId: "inst-1",
        recurringTemplateId: "tpl-20", categoryId: null,
      },
      {
        id: "row-80", name: "Transmat 80%", crmAccountId: "acc-T", installationId: "inst-1",
        recurringTemplateId: "tpl-80", categoryId: null,
      },
    ];
    const out = deriveCommittedIncome({
      ...base,
      rows,
      templates: [
        makeTemplate({
          id: "tpl-20", name: "Transmat 20%", crmAccountId: "acc-T", installationId: "inst-1",
          dayOfMonth: 20, grossPerRunClp: 200_000,
        }),
        makeTemplate({
          id: "tpl-80", name: "Transmat 80%", crmAccountId: "acc-T", installationId: "inst-1",
          dayOfMonth: 1, grossPerRunClp: 800_000,
          facturaTiming: "AL_EMITIR",
        }),
      ],
    });
    const items20 = [...(out.get("row-20")?.values() ?? [])].flatMap((c) => c.items);
    const items80 = [...(out.get("row-80")?.values() ?? [])].flatMap((c) => c.items);
    expect(items20.length).toBeGreaterThan(0);
    expect(items80.length).toBeGreaterThan(0);
    expect(items20.every((i) => i.templateId === "tpl-20")).toBe(true);
    expect(items80.every((i) => i.templateId === "tpl-80")).toBe(true);
    expect(out.get(UNMATCHED_INCOME_KEY)).toBeUndefined();
  });

  it("DTE con recurringTemplateId cae en la fila del template, no en la genérica", () => {
    const rows: FlowRowRef[] = [
      {
        id: "row-tpl", name: "ASAP Mensual", crmAccountId: "acc-ASAP", installationId: null,
        recurringTemplateId: "tpl-asap", categoryId: null,
      },
      {
        id: "row-acc", name: "ASAP", crmAccountId: "acc-ASAP", installationId: null,
        recurringTemplateId: null, categoryId: null,
      },
    ];
    const out = deriveCommittedIncome({
      ...base,
      rows,
      dtes: [{
        id: "dte-asap", folio: 999, dateYmd: "2026-07-21", dueDateYmd: null,
        pendingClp: 1_000_000, crmAccountId: "acc-ASAP", installationId: null,
        recurringTemplateId: "tpl-asap", receiverName: "ASAP",
      }],
    });
    expect(out.get("row-tpl")?.get("2026-07-20")?.total).toBe(1_000_000);
    expect(out.get("row-acc")).toBeUndefined();
  });

  it("crmAccountId resuelto por RUT (loader) cae en la fila del cliente, no en Otros", () => {
    // El loader rellena crmAccountId vía cleanRut(receiverRut)→CrmAccount;
    // el derivador solo ve el id ya resuelto.
    const out = deriveCommittedIncome({
      ...base,
      dtes: [{
        id: "dte-rut", folio: 1234, dateYmd: "2026-07-21", dueDateYmd: "2024-07-01",
        pendingClp: 500_000, crmAccountId: "acc-A", installationId: null,
        receiverName: "Transmat",
      }],
    });
    expect(out.get("row-a")?.get("2026-07-20")?.total).toBe(500_000);
    expect(out.get(UNMATCHED_INCOME_KEY)).toBeUndefined();
    expect(out.get("row-a")?.get("2026-07-20")?.items[0]?.overdueOver60).toBe(true);
  });

  it("borrador atrasado sin override clampea a la semana actual (v4.5)", () => {
    const out = deriveCommittedIncome({
      ...base,
      drafts: [{
        // fecha doc 2026-05-01 → pasado → clamp a actual (sin +lag).
        id: "draft-past", templateId: "tpl-2", dateYmd: "2026-05-01", totalClp: 300_000,
        receiverName: "Cliente A", crmAccountId: "acc-A", installationId: null,
        templateEndDateYmd: null,
      }],
    });
    expect(out.get("row-a")?.get("2026-07-20")?.total).toBe(300_000);
    expect(out.get("row-a")?.get("2026-07-20")?.items[0]?.kind).toBe("draft");
  });

  it("borrador con override no clampea (override manda)", () => {
    const out = deriveCommittedIncome({
      ...base,
      drafts: [{
        id: "draft-ov", templateId: "tpl-2", dateYmd: "2026-05-01", totalClp: 300_000,
        receiverName: "Cliente A", crmAccountId: "acc-A", installationId: null,
        templateEndDateYmd: null,
        overrideDateYmd: "2026-06-24",
      }],
    });
    expect(out.get("row-a")?.get("2026-06-22")?.total).toBe(300_000);
    expect(out.get("row-a")?.get("2026-07-20")).toBeUndefined();
  });

  it("cuota programada vencida sigue clampeando a la semana actual", () => {
    // Template con nextRunAt en el pasado cuya emisión ya venció.
    const out = deriveCommittedIncome({
      ...base,
      templates: [makeTemplate({
        lastRunAt: new Date("2026-05-05"),
        nextRunAt: new Date("2026-06-05"),
        endDate: new Date("2026-12-31"),
      })],
      // Cubrir periodos futuros para aislar solo la cuota vencida clampeada.
      coveredPeriods: new Set([
        "tpl-1::2026-08", "tpl-1::2026-09", "tpl-1::2026-10",
        "tpl-1::2026-11", "tpl-1::2026-12", "tpl-1::2027-01",
      ]),
    });
    const current = out.get("row-a-i1")?.get("2026-07-20");
    expect(current?.items.some((i) => i.kind === "scheduled")).toBe(true);
    expect(current?.total).toBeGreaterThan(0);
  });
});

describe("deriveCommittedIncome — anclaje en emisión (v4.7)", () => {
  it("proyecta cuotas en la semana de emisión (sin +diasCobro)", () => {
    const out = deriveCommittedIncome({ ...base, templates: [makeTemplate()] });
    const cells = out.get("row-a-i1");
    // anchors 5-ago/5-sep/5-oct: emiten esos días → semanas 03-ago / 31-ago / 05-oct.
    // 5-nov > endDate 31-oct NO existe.
    expect(cells?.get("2026-08-03")?.total).toBe(500_000);
    expect(cells?.get("2026-08-31")?.total).toBe(500_000);
    expect(cells?.get("2026-10-05")?.total).toBe(500_000);
    const all = [...cells!.values()].flatMap((c) => c.items);
    expect(all).toHaveLength(3);
    expect(all.every((i) => i.kind === "scheduled" && i.templateId === "tpl-1")).toBe(true);
    expect(all.every((i) => i.endDate === "2026-10-31")).toBe(true);
    // Sin término configurado: no inventar cobro estimado.
    expect(all.every((i) => i.terminoDias == null && i.cobroEstYmd == null)).toBe(true);
  });

  it("GL Events: cuota del 20/08 ancla en su semana de emisión (sin +30)", () => {
    const out = deriveCommittedIncome({
      ...base,
      templates: [makeTemplate({
        id: "tpl-gl", name: "GL Events", dayOfMonth: 20,
        nextRunAt: new Date("2026-08-20"), lastRunAt: new Date("2026-07-20"),
        endDate: new Date("2026-12-31"),
      })],
      coveredPeriods: new Set([
        "tpl-gl::2026-09", "tpl-gl::2026-10", "tpl-gl::2026-11",
        "tpl-gl::2026-12", "tpl-gl::2027-01",
      ]),
    });
    // 20-ago-2026 = jueves → lunes 2026-08-17. Antes (v4.6) caía en ~S38 (+30).
    expect(out.get("row-a-i1")?.get("2026-08-17")?.total).toBe(500_000);
    expect(out.get("row-a-i1")?.get("2026-08-17")?.items[0]).toMatchObject({
      kind: "scheduled",
      issueYmd: "2026-08-20",
      fecha: "2026-08-20",
    });
    // El default del tenant (+30) NO mueve la celda.
    expect(out.get("row-a-i1")?.get("2026-09-14")).toBeUndefined();
  });

  it("endDate null proyecta hasta el fin del horizonte", () => {
    const out = deriveCommittedIncome({
      ...base,
      templates: [makeTemplate({ endDate: null })],
    });
    const count = [...out.get("row-a-i1")!.values()].flatMap((c) => c.items).length;
    // ago..dic = emisiones 5-ago → 5-dic.
    expect(count).toBeGreaterThanOrEqual(4);
  });

  it("término configurado es informativo y NO mueve la celda", () => {
    const out = deriveCommittedIncome({
      ...base,
      templates: [makeTemplate({ diasCobro: 60 })],
    });
    const cells = out.get("row-a-i1");
    // Emisión 5-ago → semana 2026-08-03 (sin +60).
    expect(cells?.get("2026-08-03")?.total).toBe(500_000);
    expect(cells?.get("2026-08-03")?.items[0]).toMatchObject({
      issueYmd: "2026-08-05",
      terminoDias: 60,
      cobroEstYmd: "2026-10-04",
    });
    // Con el lag viejo habría caído en 2026-09-28; ya no.
    expect(cells?.get("2026-09-28")).toBeUndefined();
  });

  it("término 0 no expone cobroEst redundante", () => {
    const out = deriveCommittedIncome({
      ...base,
      templates: [makeTemplate({ diasCobro: 0 })],
      coveredPeriods: new Set([
        "tpl-1::2026-09", "tpl-1::2026-10", "tpl-1::2026-11",
        "tpl-1::2026-12", "tpl-1::2027-01",
      ]),
    });
    const item = out.get("row-a-i1")?.get("2026-08-03")?.items[0];
    expect(item).toMatchObject({ terminoDias: 0, cobroEstYmd: null, issueYmd: "2026-08-05" });
  });

  it("collectionLagDays del tenant no desplaza cuotas ni borradores", () => {
    const out = deriveCommittedIncome({
      ...base,
      collectionLagDays: 45,
      templates: [makeTemplate()],
      coveredPeriods: new Set([
        "tpl-1::2026-09", "tpl-1::2026-10", "tpl-1::2026-11",
        "tpl-1::2026-12", "tpl-1::2027-01",
      ]),
      drafts: [{
        id: "draft-lag", templateId: "tpl-2", dateYmd: "2026-08-04", totalClp: 100_000,
        receiverName: "Cliente A", crmAccountId: "acc-A", installationId: null,
        templateEndDateYmd: null,
      }],
    });
    // Cuota: emisión 5-ago → S 2026-08-03 (no +45).
    expect(out.get("row-a-i1")?.get("2026-08-03")?.total).toBe(500_000);
    // Borrador: fecha doc 4-ago → S 2026-08-03 (no +45).
    expect(out.get("row-a")?.get("2026-08-03")?.total).toBe(100_000);
  });

  it("dedup: el período cubierto por DTE emitido no se proyecta", () => {
    const out = deriveCommittedIncome({
      ...base,
      templates: [makeTemplate()],
      coveredPeriods: new Set(["tpl-1::2026-08"]),
    });
    const cells = out.get("row-a-i1");
    expect(cells?.get("2026-08-03")).toBeUndefined();
    expect(cells?.get("2026-08-31")?.total).toBe(500_000);
  });

  it("borrador ancla en fecha del documento (sin +lag)", () => {
    const out = deriveCommittedIncome({
      ...base,
      drafts: [{
        id: "draft-1", templateId: "tpl-2", dateYmd: "2026-08-01", totalClp: 700_000,
        receiverName: "Cliente A", crmAccountId: "acc-A", installationId: null,
        templateEndDateYmd: null,
      }],
    });
    // 1-ago-2026 = sábado → lunes 2026-07-27. Antes (+30) caía en 2026-08-31.
    const cell = out.get("row-a")?.get("2026-07-27");
    expect(cell?.total).toBe(700_000);
    expect(cell?.items[0]).toMatchObject({
      kind: "draft",
      dteId: "draft-1",
      templateId: "tpl-2",
      issueYmd: "2026-08-01",
      sentDocs: { proforma: false, estadoPago: false },
    });
  });

  it("borrador distingue EP y Proforma en sentDocs", () => {
    const out = deriveCommittedIncome({
      ...base,
      drafts: [{
        id: "draft-2", templateId: "tpl-2", dateYmd: "2026-08-01", totalClp: 500_000,
        receiverName: "Cliente A", crmAccountId: "acc-A", installationId: null,
        sentDocs: { proforma: false, estadoPago: true },
        templateEndDateYmd: null,
        templateDiasCobro: 3,
      }],
    });
    const cell = out.get("row-a")?.get("2026-07-27");
    expect(cell?.items[0]).toMatchObject({
      kind: "draft",
      sentDocs: { proforma: false, estadoPago: true },
      terminoDias: 3,
      cobroEstYmd: "2026-08-04",
      issueYmd: "2026-08-01",
    });
  });
});

describe("grossPerRunFromLines", () => {
  it("línea CLP afecta suma IVA; exenta no; dteType 34 todo exento", () => {
    const lines = [
      { quantity: 1, unitPrice: 100_000 },
      { quantity: 1, unitPrice: 50_000, isExempt: true },
    ];
    expect(grossPerRunFromLines(lines, "CLP", 33, null)).toBe(119_000 + 50_000);
    expect(grossPerRunFromLines(lines, "CLP", 34, null)).toBe(150_000);
  });

  it("línea UF convierte con el valor entregado", () => {
    const lines = [{ quantity: 1, unitPriceUf: 40, priceCurrency: "UF" as const }];
    expect(grossPerRunFromLines(lines, "CLP", 33, 39_485)).toBe(Math.round(40 * 39_485 * 1.19));
    // Sin UF disponible → 0 (visible en la UI, no inventa monto).
    expect(grossPerRunFromLines(lines, "CLP", 33, null)).toBe(0);
  });
});
