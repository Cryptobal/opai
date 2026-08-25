import { describe, it, expect } from "vitest";
import {
  applyTeDiscountToLiquido,
  shouldPaintTeWeeklyProjection,
  computeCellDrift,
  computeF29FutureClp,
  computeFiniquitosMonthly,
  computePctSalesClp,
  computeRetiroSocioClp,
  computeTeHistoricalWeekly,
  computeTePctPayrollWeekly,
  payWeekForMonthDay,
  resolveRetiroPctFraction,
  teHistoricalAmountSamples,
} from "../derive-committed-expense-params";

describe("computeRetiroSocioClp", () => {
  it("retorna 0 si pct <= 0", () => {
    expect(computeRetiroSocioClp(0, 10_000_000)).toBe(0);
    expect(computeRetiroSocioClp(-0.1, 10_000_000)).toBe(0);
  });

  it("redondea pct × ventas netas del mes anterior", () => {
    expect(computeRetiroSocioClp(0.05, 10_000_000)).toBe(500_000);
    expect(computeRetiroSocioClp(0.033, 9_999_999)).toBe(Math.round(0.033 * 9_999_999));
  });

  it("ventas 0 ⇒ proyección 0 (sin negativo espurio)", () => {
    expect(computePctSalesClp(0.1, 0)).toBe(0);
  });
});

describe("resolveRetiroPctFraction — precedencia regla % vs knob global", () => {
  it("regla PCT_SALES de la fila pisa el knob global", () => {
    expect(resolveRetiroPctFraction({
      rowHasPctSalesRule: true,
      rulePctFraction: 0.1,
      globalPctFraction: 0.05,
    })).toBe(0.1);
  });

  it("sin regla, manda el knob global", () => {
    expect(resolveRetiroPctFraction({
      rowHasPctSalesRule: false,
      rulePctFraction: 0.1,
      globalPctFraction: 0.05,
    })).toBe(0.05);
  });

  it("regla presente pero pct inválido ⇒ 0 (no cae al global)", () => {
    expect(resolveRetiroPctFraction({
      rowHasPctSalesRule: true,
      rulePctFraction: 0,
      globalPctFraction: 0.05,
    })).toBe(0);
  });
});

describe("payWeekForMonthDay", () => {
  it("devuelve el lunes ISO de la semana del día de pago", () => {
    // 2026-08-05 (miércoles) → lunes 2026-08-03
    expect(payWeekForMonthDay(2026, 7, 5)).toBe("2026-08-03");
    // 2026-02-28 (sábado) → lunes 2026-02-23
    expect(payWeekForMonthDay(2026, 1, 28)).toBe("2026-02-23");
  });
});

describe("teHistoricalAmountSamples", () => {
  const paid = new Map([
    ["2026-08-03", 400_000],
    ["2026-08-10", 500_000],
    ["2026-08-17", 600_000],
  ]);

  it("con semanas pasadas en la ventana (planilla hoy−4sem) usa solo esas", () => {
    const weeks = ["2026-07-27", "2026-08-03", "2026-08-10", "2026-08-17", "2026-08-24"];
    expect(teHistoricalAmountSamples(weeks, "2026-08-24", paid)).toEqual([
      400_000, 500_000, 600_000,
    ]);
  });

  it("sin pasado en la ventana (MCP que arranca en la semana actual) cae al fallback de paidByWeek", () => {
    const weeks = ["2026-08-24", "2026-08-31"];
    expect(teHistoricalAmountSamples(weeks, "2026-08-24", paid)).toEqual([
      400_000, 500_000, 600_000,
    ]);
    // Muestra distinta si el fallback incluye semanas que la planilla no ve
    const extra = new Map(paid);
    extra.set("2026-07-20", 8_000_000);
    expect(teHistoricalAmountSamples(["2026-08-24"], "2026-08-24", extra)).toEqual([
      400_000, 500_000, 600_000, 8_000_000,
    ]);
    expect(
      teHistoricalAmountSamples(
        ["2026-07-27", "2026-08-03", "2026-08-10", "2026-08-17", "2026-08-24"],
        "2026-08-24",
        extra,
      ),
    ).toEqual([400_000, 500_000, 600_000]);
  });
});

describe("computeTeHistoricalWeekly", () => {
  it("promedia las últimas N semanas (default 8)", () => {
    const amounts = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1_000];
    expect(computeTeHistoricalWeekly(amounts)).toBe(Math.round((300 + 400 + 500 + 600 + 700 + 800 + 900 + 1_000) / 8));
    expect(computeTeHistoricalWeekly(amounts, 3)).toBe(Math.round((800 + 900 + 1_000) / 3));
  });

  it("retorna 0 con historial vacío", () => {
    expect(computeTeHistoricalWeekly([])).toBe(0);
  });
});

describe("computeTePctPayrollWeekly", () => {
  it("round(pct × líquido / semanasDelMes)", () => {
    expect(computeTePctPayrollWeekly(0.1, 9_000_000, 4)).toBe(Math.round(0.1 * 9_000_000 / 4));
    expect(computeTePctPayrollWeekly(0, 9_000_000, 4)).toBe(0);
  });
});

describe("applyTeDiscountToLiquido", () => {
  it("descuenta TE del líquido y clampa a 0", () => {
    const r = applyTeDiscountToLiquido(9_000_000, 840_000, 1);
    expect(r.base).toBe(9_000_000);
    expect(r.discount).toBe(840_000);
    expect(r.net).toBe(8_160_000);
  });

  it("no deja líquido negativo", () => {
    const r = applyTeDiscountToLiquido(500_000, 840_000, 1);
    expect(r.discount).toBe(840_000);
    expect(r.net).toBe(0);
  });

  it("TE + quincena en cadena: total caja = líquido base", () => {
    const liquidoBase = 92_130_760;
    const teMes = 4_606_540;
    const quincena = 4_606_538;
    const afterTe = applyTeDiscountToLiquido(liquidoBase, teMes, 1);
    const afterQuin = applyTeDiscountToLiquido(afterTe.net, quincena, 1);
    expect(afterQuin.net + teMes + quincena).toBe(liquidoBase);
  });
});

describe("shouldPaintTeWeeklyProjection", () => {
  const blocked = new Set<string>();

  it("pinta semanas futuras", () => {
    expect(
      shouldPaintTeWeeklyProjection({
        weekYmd: "2026-08-31",
        currentWeek: "2026-08-24",
        pendingTeTotal: 0,
        blocked,
      }),
    ).toBe(true);
  });

  it("no pinta la semana actual si hay TE aprobado por pagar", () => {
    expect(
      shouldPaintTeWeeklyProjection({
        weekYmd: "2026-08-24",
        currentWeek: "2026-08-24",
        pendingTeTotal: 840_000,
        blocked,
      }),
    ).toBe(false);
  });

  it("pinta la semana actual si no hay TE pendiente", () => {
    expect(
      shouldPaintTeWeeklyProjection({
        weekYmd: "2026-08-24",
        currentWeek: "2026-08-24",
        pendingTeTotal: 0,
        blocked,
      }),
    ).toBe(true);
  });

  it("no pinta semanas bloqueadas por plan", () => {
    expect(
      shouldPaintTeWeeklyProjection({
        weekYmd: "2026-08-31",
        currentWeek: "2026-08-24",
        pendingTeTotal: 0,
        blocked: new Set(["2026-08-31"]),
      }),
    ).toBe(false);
  });
});

describe("computeFiniquitosMonthly", () => {
  it("usa manual si está seteado", () => {
    expect(computeFiniquitosMonthly(2_500_000, [100, 200])).toBe(2_500_000);
  });

  it("promedia reales si no hay manual; 0 si vacío", () => {
    expect(computeFiniquitosMonthly(null, [1_000_000, 3_000_000])).toBe(2_000_000);
    expect(computeFiniquitosMonthly(undefined, [])).toBe(0);
  });
});

describe("computeF29FutureClp", () => {
  it("calcula débito, crédito y total con PPM", () => {
    const r = computeF29FutureClp({
      ventasNetasProyectadas: 10_000_000,
      netoFacturasRecibidas: 1_000_000,
      avgCreditoHistorico: 500_000,
      fractionElapsed: 0.5,
      ppmClp: 100_000,
    });
    expect(r.debito).toBe(Math.round(0.19 * 10_000_000));
    expect(r.credito).toBe(Math.round(0.19 * 1_000_000) + Math.round(0.5 * 500_000));
    expect(r.ppm).toBe(100_000);
    expect(r.ivaDeterminado).toBe(r.debito - r.credito);
    expect(r.total).toBe(Math.max(0, r.debito - r.credito + r.ppm));
    expect(r.clamped).toBe(r.debito - r.credito + r.ppm < 0);
  });

  it("clampa total a 0 cuando crédito supera débito + ppm", () => {
    const r = computeF29FutureClp({
      ventasNetasProyectadas: 100_000,
      netoFacturasRecibidas: 10_000_000,
      avgCreditoHistorico: 5_000_000,
      fractionElapsed: 0,
      ppmClp: 0,
    });
    expect(r.total).toBe(0);
    expect(r.clamped).toBe(true);
  });
});

describe("computeCellDrift", () => {
  it("retorna null si no hay real", () => {
    expect(computeCellDrift(100, 80, null)).toBeNull();
  });

  it("usa plan si ≠0, si no committed; delta y pct", () => {
    const withPlan = computeCellDrift(100, 80, 90)!;
    expect(withPlan.projected).toBe(100);
    expect(withPlan.delta).toBe(-10);
    expect(withPlan.pct).toBe(-10);

    const noPlan = computeCellDrift(0, 80, 100)!;
    expect(noPlan.projected).toBe(80);
    expect(noPlan.delta).toBe(20);
    expect(noPlan.pct).toBe(25);
  });
});
