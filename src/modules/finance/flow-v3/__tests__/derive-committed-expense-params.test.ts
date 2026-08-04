import { describe, it, expect } from "vitest";
import {
  applyTeDiscountToLiquido,
  computeCellDrift,
  computeF29FutureClp,
  computeFiniquitosMonthly,
  computeRetiroSocioClp,
  computeTeHistoricalWeekly,
  computeTePctPayrollWeekly,
  payWeekForMonthDay,
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
});

describe("payWeekForMonthDay", () => {
  it("devuelve el lunes ISO de la semana del día de pago", () => {
    // 2026-08-05 (miércoles) → lunes 2026-08-03
    expect(payWeekForMonthDay(2026, 7, 5)).toBe("2026-08-03");
    // 2026-02-28 (sábado) → lunes 2026-02-23
    expect(payWeekForMonthDay(2026, 1, 28)).toBe("2026-02-23");
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
