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
  it("emitida no pagada cae en la semana del vencimiento", () => {
    const out = deriveCommittedIncome({
      ...base,
      dtes: [{
        id: "dte-1", folio: 101, dateYmd: "2026-07-01", dueDateYmd: "2026-08-05",
        pendingClp: 1_190_000, crmAccountId: "acc-A", installationId: "inst-1", receiverName: "Cliente A",
      }],
    });
    const cell = out.get("row-a-i1")?.get("2026-08-03");
    expect(cell?.total).toBe(1_190_000);
    expect(cell?.items[0]).toMatchObject({ kind: "dte", folio: 101, dteId: "dte-1" });
  });

  it("sin dueDate usa emisión+30d; vencida clampea a la semana actual", () => {
    const out = deriveCommittedIncome({
      ...base,
      dtes: [{
        id: "dte-2", folio: 90, dateYmd: "2026-05-01", dueDateYmd: null,
        pendingClp: 200_000, crmAccountId: "acc-A", installationId: "inst-1", receiverName: "Cliente A",
      }],
    });
    // 2026-05-31 quedó en el pasado → cobrable AHORA (semana actual).
    expect(out.get("row-a-i1")?.get("2026-07-20")?.total).toBe(200_000);
  });

  it("instalación sin fila exacta cae en la fila genérica de la cuenta; cuenta sin fila → unmatched", () => {
    const out = deriveCommittedIncome({
      ...base,
      dtes: [
        { id: "d3", folio: 1, dateYmd: "2026-07-21", dueDateYmd: "2026-08-20", pendingClp: 10, crmAccountId: "acc-A", installationId: "inst-otra", receiverName: "A" },
        { id: "d4", folio: 2, dateYmd: "2026-07-21", dueDateYmd: "2026-08-20", pendingClp: 20, crmAccountId: "acc-Z", installationId: null, receiverName: "Z" },
      ],
    });
    expect(out.get("row-a")?.get("2026-08-17")?.total).toBe(10);
    expect(out.get(UNMATCHED_INCOME_KEY)?.get("2026-08-17")?.total).toBe(20);
  });
});

describe("deriveCommittedIncome — programaciones", () => {
  it("proyecta cuotas futuras solo hasta endDate inclusive", () => {
    const out = deriveCommittedIncome({ ...base, templates: [makeTemplate()] });
    const cells = out.get("row-a-i1");
    // anchors 5-ago/5-sep/5-oct (+30d cobro): 5-nov > endDate 31-oct NO existe.
    expect(cells?.get("2026-08-31")?.total).toBe(500_000);
    expect(cells?.get("2026-10-05")?.total).toBe(500_000);
    expect(cells?.get("2026-11-02")?.total).toBe(500_000);
    const all = [...cells!.values()].flatMap((c) => c.items);
    expect(all).toHaveLength(3);
    expect(all.every((i) => i.kind === "scheduled" && i.templateId === "tpl-1")).toBe(true);
    expect(all.every((i) => i.endDate === "2026-10-31")).toBe(true);
  });

  it("endDate null proyecta hasta el fin del horizonte", () => {
    const out = deriveCommittedIncome({
      ...base,
      templates: [makeTemplate({ endDate: null })],
    });
    const count = [...out.get("row-a-i1")!.values()].flatMap((c) => c.items).length;
    // ago..dic = emisiones 5-ago → 5-dic cuyos cobros entran al rango.
    expect(count).toBeGreaterThanOrEqual(4);
  });

  it("dedup: el período cubierto por DTE emitido no se proyecta", () => {
    const out = deriveCommittedIncome({
      ...base,
      templates: [makeTemplate()],
      coveredPeriods: new Set(["tpl-1::2026-08"]),
    });
    const cells = out.get("row-a-i1");
    expect(cells?.get("2026-08-31")).toBeUndefined();
    expect(cells?.get("2026-10-05")?.total).toBe(500_000);
  });

  it("borrador de programación entra como scheduled con su monto real", () => {
    const out = deriveCommittedIncome({
      ...base,
      drafts: [{
        id: "draft-1", templateId: "tpl-2", dateYmd: "2026-08-01", totalClp: 700_000,
        receiverName: "Cliente A", crmAccountId: "acc-A", installationId: null,
        templateEndDateYmd: null,
      }],
    });
    const cell = out.get("row-a")?.get("2026-08-31");
    expect(cell?.total).toBe(700_000);
    expect(cell?.items[0]).toMatchObject({ kind: "scheduled", dteId: "draft-1", templateId: "tpl-2" });
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
