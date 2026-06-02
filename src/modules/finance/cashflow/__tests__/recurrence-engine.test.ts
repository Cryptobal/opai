import { describe, it, expect } from "vitest";
import {
  expandRecurrence,
  bucketKeyFor,
  calcularFechaEmisionProyectada,
} from "../recurrence-engine";
import type { FinanceCashflowItem } from "@prisma/client";

type Item = Pick<
  FinanceCashflowItem,
  "recurrence" | "startDate" | "endDate" | "dayOfMonth" | "dayOfWeek" | "monthOfYear"
>;

function build(overrides: Partial<Item> = {}): Item {
  return {
    recurrence: "MONTHLY",
    startDate: new Date("2026-01-01"),
    endDate: null,
    dayOfMonth: 15,
    dayOfWeek: null,
    monthOfYear: null,
    ...overrides,
  };
}

describe("expandRecurrence", () => {
  it("ONCE: returns exactly one date when in range", () => {
    const item = build({ recurrence: "ONCE", startDate: new Date("2026-03-15") });
    const dates = expandRecurrence(item, new Date("2026-01-01"), new Date("2026-12-31"));
    expect(dates).toHaveLength(1);
    expect(dates[0].toISOString().slice(0, 10)).toBe("2026-03-15");
  });

  it("ONCE: returns empty when out of range", () => {
    const item = build({ recurrence: "ONCE", startDate: new Date("2025-01-01") });
    const dates = expandRecurrence(item, new Date("2026-01-01"), new Date("2026-12-31"));
    expect(dates).toHaveLength(0);
  });

  it("WEEKLY: dayOfWeek=5 returns all Fridays in range", () => {
    const item = build({
      recurrence: "WEEKLY",
      dayOfWeek: 5,
      startDate: new Date("2026-01-01"),
    });
    const dates = expandRecurrence(item, new Date("2026-01-01"), new Date("2026-01-31"));
    expect(dates.length).toBeGreaterThanOrEqual(4);
    for (const d of dates) {
      expect(d.getDay()).toBe(5);
    }
  });

  it("BIWEEKLY: emits dates every 2 weeks", () => {
    const item = build({
      recurrence: "BIWEEKLY",
      dayOfWeek: 1,
      startDate: new Date("2026-01-05"),
    });
    const dates = expandRecurrence(item, new Date("2026-01-01"), new Date("2026-02-28"));
    expect(dates.length).toBeGreaterThanOrEqual(4);
    for (let i = 1; i < dates.length; i++) {
      const diff = (dates[i].getTime() - dates[i - 1].getTime()) / (1000 * 60 * 60 * 24);
      expect(diff).toBe(14);
    }
  });

  it("MONTHLY: dayOfMonth=15 emits day 15 of each month", () => {
    const item = build({ dayOfMonth: 15 });
    const dates = expandRecurrence(item, new Date("2026-01-01"), new Date("2026-06-30"));
    expect(dates).toHaveLength(6);
    for (const d of dates) {
      expect(d.getDate()).toBe(15);
    }
  });

  it("MONTHLY: dayOfMonth=-1 emits last day of each month (Feb 28)", () => {
    const item = build({ dayOfMonth: -1, startDate: new Date("2026-01-01") });
    const dates = expandRecurrence(item, new Date("2026-01-01"), new Date("2026-04-30"));
    expect(dates).toHaveLength(4);
    expect(dates[0].getDate()).toBe(31); // Jan
    expect(dates[1].getDate()).toBe(28); // Feb 2026 (not leap)
    expect(dates[2].getDate()).toBe(31); // Mar
    expect(dates[3].getDate()).toBe(30); // Apr
  });

  it("MONTHLY: dayOfMonth=31 in 30-day month adjusts to 30", () => {
    const item = build({ dayOfMonth: 31, startDate: new Date("2026-04-01") });
    const dates = expandRecurrence(item, new Date("2026-04-01"), new Date("2026-04-30"));
    expect(dates).toHaveLength(1);
    expect(dates[0].getDate()).toBe(30);
  });

  it("YEARLY with monthOfYear", () => {
    const item = build({
      recurrence: "YEARLY",
      monthOfYear: 4,
      dayOfMonth: 30,
      startDate: new Date("2026-01-01"),
    });
    const dates = expandRecurrence(item, new Date("2026-01-01"), new Date("2028-12-31"));
    expect(dates).toHaveLength(3);
    for (const d of dates) {
      expect(d.getMonth()).toBe(3); // April = month index 3
      expect(d.getDate()).toBe(30);
    }
  });

  it("respects endDate cutoff", () => {
    const item = build({
      dayOfMonth: 15,
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-03-20"),
    });
    const dates = expandRecurrence(item, new Date("2026-01-01"), new Date("2026-12-31"));
    expect(dates).toHaveLength(3);
  });

  it("startDate after range returns empty", () => {
    const item = build({ startDate: new Date("2030-01-01") });
    const dates = expandRecurrence(item, new Date("2026-01-01"), new Date("2026-12-31"));
    expect(dates).toHaveLength(0);
  });
});

describe("bucketKeyFor", () => {
  it("monthly format YYYY-MM", () => {
    expect(bucketKeyFor(new Date("2026-03-15"), "monthly")).toBe("2026-03");
    expect(bucketKeyFor(new Date("2026-12-01"), "monthly")).toBe("2026-12");
  });

  it("weekly format YYYY-Www", () => {
    const k = bucketKeyFor(new Date("2026-01-15"), "weekly");
    expect(k).toMatch(/^\d{4}-W\d{2}$/);
  });
});

describe("calcularFechaEmisionProyectada — placement = emisión, NO cobro", () => {
  // Regla de producto: el flujo de caja ubica el ingreso recurrente en la
  // fecha de EMISIÓN del borrador (día de la programación), no en la fecha de
  // cobro. `diasCobroDesdeFactura` ya no desplaza la celda. Asserts en UTC
  // (la función retorna fechas UTC) para no depender del timezone del runner.
  const cal = (over: Record<string, unknown> = {}) => ({
    diasCobroDesdeFactura: 0,
    emiteProforma: false,
    diaEmisionProforma: null,
    diasFacturaDesdeProforma: null,
    diaEmisionFactura: null,
    mesFacturaRelativo: "MISMO_MES",
    dayOfMonth: null,
    ...over,
  });

  it("factura directa día 20 con lag de cobro=20: ubica el 20 jun, no el 10 jul", () => {
    const d = calcularFechaEmisionProyectada(
      cal({ diasCobroDesdeFactura: 20, diaEmisionFactura: 20, dayOfMonth: 20 }),
      2026,
      5, // junio (0-based)
    );
    expect(d).not.toBeNull();
    expect(d!.getUTCFullYear()).toBe(2026);
    expect(d!.getUTCMonth()).toBe(5);
    expect(d!.getUTCDate()).toBe(20);
  });

  it("legacy (diasCobroDesdeFactura=0): retorna null → caller usa dayOfMonth", () => {
    const d = calcularFechaEmisionProyectada(
      cal({ diasCobroDesdeFactura: 0, dayOfMonth: 20 }),
      2026,
      5,
    );
    expect(d).toBeNull();
  });

  it("proforma→factura: ubica en la fecha de factura (emisión), sin sumar cobro", () => {
    // proforma día 1 + 5 días = factura día 6; el cobro a 30 días NO se suma.
    const d = calcularFechaEmisionProyectada(
      cal({
        diasCobroDesdeFactura: 30,
        emiteProforma: true,
        diaEmisionProforma: 1,
        diasFacturaDesdeProforma: 5,
      }),
      2026,
      5,
    );
    expect(d!.getUTCMonth()).toBe(5);
    expect(d!.getUTCDate()).toBe(6);
  });
});
