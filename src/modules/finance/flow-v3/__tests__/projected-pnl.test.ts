import { describe, expect, it } from "vitest";
import {
  allocateGavByRevenue,
  assembleProjectedPnl,
  buildMonthColumns,
  completeMonthKeysBefore,
  coveredPeriodKey,
  enumerateMonthKeys,
  gapFillOpenMonths,
  monthKeyStartUtc,
  monthLabel,
  monthlyRunRate,
  netPerRunFromLines,
  recognitionMonthKey,
  signedDocumentNet,
  UNASSIGNED_INSTALLATION,
} from "../projected-pnl";

const MONTHS = buildMonthColumns(["2026-06", "2026-07", "2026-08"], "2026-07-15");

describe("projected-pnl recognition", () => {
  it("billingPeriod manda sobre la fecha de emisión/cobro", () => {
    expect(recognitionMonthKey("2026-06", "2026-07-05")).toBe("2026-06");
    expect(recognitionMonthKey(null, "2026-07-05")).toBe("2026-07");
    expect(recognitionMonthKey("nope", "2026-07-05")).toBe("2026-07");
  });

  it("enumerateMonthKeys es inclusivo y no cruza el tope", () => {
    expect(enumerateMonthKeys("2026-06-22", "2026-08-19")).toEqual([
      "2026-06",
      "2026-07",
      "2026-08",
    ]);
    expect(enumerateMonthKeys("2026-12-01", "2027-01-31")).toEqual([
      "2026-12",
      "2027-01",
    ]);
    expect(enumerateMonthKeys("2026-08-01", "2026-06-01")).toEqual([]);
  });

  it("monthLabel en español corto", () => {
    expect(monthLabel("2026-08")).toBe("Ago 2026");
  });
});

describe("signedDocumentNet", () => {
  it("factura emitida suma neto; NC resta", () => {
    expect(signedDocumentNet(33, 1000, "ISSUED")).toBe(1000);
    expect(signedDocumentNet(61, 200, "ISSUED")).toBe(-200);
    expect(signedDocumentNet(52, 100, "ISSUED")).toBe(0);
  });

  it("compra recibida suma; NC de compra resta", () => {
    expect(signedDocumentNet(46, 500, "RECEIVED")).toBe(500);
    expect(signedDocumentNet(61, 80, "RECEIVED")).toBe(-80);
  });
});

describe("netPerRunFromLines", () => {
  it("devuelve neto sin IVA y convierte UF", () => {
    const clp = netPerRunFromLines(
      [{ quantity: 1, unitPrice: 1000, discountPct: 0 }],
      "CLP",
      null,
    );
    expect(clp).toBe(1000);

    const uf = netPerRunFromLines(
      [{ quantity: 2, unitPriceUf: 1, priceCurrency: "UF", discountPct: 0 }],
      "UF",
      10_000,
    );
    expect(uf).toBe(20_000);
  });
});

describe("allocateGavByRevenue", () => {
  it("prorratea GAV del mes por ingresos y corrige residuo", () => {
    const revenue = new Map<string, number[]>([
      ["a", [100, 0]],
      ["b", [300, 50]],
      [UNASSIGNED_INSTALLATION, [999, 999]],
    ]);
    const allocated = allocateGavByRevenue([400, 100], revenue);
    expect(allocated.get("a")![0] + allocated.get("b")![0]).toBe(400);
    expect(allocated.get("a")![0]).toBe(100);
    expect(allocated.get("b")![0]).toBe(300);
    // Mes 2: solo b factura → se lleva todo el GAV.
    expect(allocated.get("b")![1]).toBe(100);
    expect(allocated.get("a")![1]).toBe(0);
    expect(allocated.has(UNASSIGNED_INSTALLATION)).toBe(false);
  });

  it("si nadie factura el GAV no se atribuye", () => {
    const revenue = new Map<string, number[]>([["a", [0]], ["b", [0]]]);
    const allocated = allocateGavByRevenue([80], revenue);
    expect(allocated.get("a")![0]).toBe(0);
    expect(allocated.get("b")![0]).toBe(0);
  });
});

describe("assembleProjectedPnl", () => {
  it("atribuye ingreso al mes de billingPeriod, no al de cobro", () => {
    const result = assembleProjectedPnl({
      months: MONTHS,
      issued: [
        {
          dteType: 33,
          netAmount: 1_000_000,
          dateYmd: "2026-07-20",
          billingPeriod: "2026-06",
          installationId: "inst-1",
        },
      ],
      templates: [],
      personnel: [],
      extraShifts: [],
      received: [],
      gavRecurrences: [],
      installationNames: new Map([["inst-1", "Faena Norte"]]),
    });
    expect(result.company.revenue).toEqual([1_000_000, 0, 0]);
    expect(result.installations[0]?.name).toBe("Faena Norte");
    expect(result.installations[0]?.monthly.revenue[0]).toBe(1_000_000);
    expect(result.installations[0]?.monthly.revenue[1]).toBe(0);
  });

  it("proyecta cuotas de template en meses no cubiertos", () => {
    const result = assembleProjectedPnl({
      months: MONTHS,
      issued: [
        {
          dteType: 33,
          netAmount: 500,
          dateYmd: "2026-06-05",
          billingPeriod: "2026-06",
          installationId: "inst-1",
          recurringTemplateId: "tpl",
        },
      ],
      templates: [
        {
          id: "tpl",
          installationId: "inst-1",
          netPerRunClp: 500,
          periods: ["2026-07", "2026-08"],
        },
      ],
      personnel: [],
      extraShifts: [],
      received: [],
      gavRecurrences: [],
    });
    expect(result.company.revenue).toEqual([500, 500, 500]);
  });

  it("corta personal y resultado por instalación y prorratea GAV", () => {
    const result = assembleProjectedPnl({
      months: MONTHS,
      issued: [
        {
          dteType: 33,
          netAmount: 800,
          dateYmd: "2026-07-01",
          billingPeriod: "2026-07",
          installationId: "norte",
        },
        {
          dteType: 33,
          netAmount: 200,
          dateYmd: "2026-07-01",
          billingPeriod: "2026-07",
          installationId: "sur",
        },
      ],
      templates: [],
      personnel: [
        { installationId: "norte", name: "Norte", monthlyCostClp: 100 },
        { installationId: "sur", name: "Sur", monthlyCostClp: 40 },
      ],
      extraShifts: [
        { installationId: "norte", dateYmd: "2026-07-10", amountClp: 20 },
      ],
      received: [
        { dteType: 33, netAmount: 50, dateYmd: "2026-07-02", installationId: "norte" },
        { dteType: 33, netAmount: 100, dateYmd: "2026-07-02", installationId: null },
      ],
      gavRecurrences: [],
    });

    const julio = 1;
    expect(result.company.revenue[julio]).toBe(1000);
    expect(result.company.personnel[julio]).toBe(140);
    expect(result.company.extraShifts[julio]).toBe(20);
    expect(result.company.directCost[julio]).toBe(50);
    expect(result.company.gav[julio]).toBe(100);
    expect(result.company.result[julio]).toBe(1000 - 140 - 20 - 50 - 100);

    const norte = result.installations.find((i) => i.installationId === "norte")!;
    const sur = result.installations.find((i) => i.installationId === "sur")!;
    expect(norte.monthly.gav[julio]).toBe(80);
    expect(sur.monthly.gav[julio]).toBe(20);
    expect(norte.monthly.personnel[julio]).toBe(100);
    expect(norte.monthly.extraShifts[julio]).toBe(20);
    expect(norte.monthly.directCost[julio]).toBe(50);
    expect(norte.monthly.result[julio]).toBe(800 - 100 - 20 - 50 - 80);
    expect(sur.monthly.result[julio]).toBe(200 - 40 - 0 - 0 - 20);
    expect(result.allocationMethod).toBe("by_revenue");
  });

  it("repite GAV de equipo interno en cada mes", () => {
    const result = assembleProjectedPnl({
      months: MONTHS,
      issued: [],
      templates: [],
      personnel: [],
      extraShifts: [],
      received: [],
      gavRecurrences: MONTHS.map((m) => ({ monthKey: m.key, amountClp: 50 })),
    });
    expect(result.company.gav).toEqual([50, 50, 50]);
    expect(result.company.personnel).toEqual([0, 0, 0]);
  });

  it("coveredPeriodKey es estable", () => {
    expect(coveredPeriodKey("tpl", "2026-07")).toBe("tpl::2026-07");
  });
});

describe("run-rate helpers", () => {
  it("completeMonthKeysBefore toma meses cerrados, no el mes en curso", () => {
    expect(completeMonthKeysBefore("2026-09-03", 3)).toEqual([
      "2026-06",
      "2026-07",
      "2026-08",
    ]);
    expect(completeMonthKeysBefore("2026-01-15", 3)).toEqual([
      "2025-10",
      "2025-11",
      "2025-12",
    ]);
    expect(completeMonthKeysBefore("2026-02-01", 1)).toEqual(["2026-01"]);
    expect(completeMonthKeysBefore("bad", 3)).toEqual([]);
  });

  it("monthKeyStartUtc ancla al primer día UTC", () => {
    expect(monthKeyStartUtc("2026-06").toISOString()).toBe("2026-06-01T00:00:00.000Z");
  });

  it("monthlyRunRate promedia ceros de meses sin movimiento", () => {
    const byMonth = new Map([["2026-06", 90], ["2026-08", 30]]);
    expect(monthlyRunRate(byMonth, ["2026-06", "2026-07", "2026-08"])).toBe(40);
    expect(monthlyRunRate(undefined, ["2026-06"])).toBe(0);
    expect(monthlyRunRate(byMonth, [])).toBe(0);
  });

  it("gapFillOpenMonths rellena actual/futuro y no toca meses pasados", () => {
    const months = buildMonthColumns(
      ["2026-07", "2026-08", "2026-09", "2026-10"],
      "2026-09-03",
    );
    const filled = gapFillOpenMonths({
      months,
      rateMonthKeys: ["2026-06", "2026-07", "2026-08"],
      actuals: [
        { key: "norte", monthKey: "2026-06", amount: 30 },
        { key: "norte", monthKey: "2026-07", amount: 30 },
        { key: "norte", monthKey: "2026-08", amount: 30 },
        { key: "norte", monthKey: "2026-09", amount: 10 },
      ],
      toItem: (key, monthKey, amount) => ({ key, monthKey, amount }),
    });
    expect(filled).toEqual([
      { key: "norte", monthKey: "2026-09", amount: 20 },
      { key: "norte", monthKey: "2026-10", amount: 30 },
    ]);
    expect(filled.some((x) => x.monthKey === "2026-07")).toBe(false);
  });
});
