import { describe, it, expect, vi } from "vitest";

// El service importa transitivamente `@/lib/resend`, que tira si
// RESEND_API_KEY no está al cargar el módulo. Stub previo al import
// para que el test pueda ejercitar la función pura computeNextRunAt.
vi.hoisted(() => {
  process.env.RESEND_API_KEY ??= "test_resend_key_for_tests";
});

import { computeNextRunAt } from "../dte-recurring.service";

const monthlyTpl = (overrides: Partial<Parameters<typeof computeNextRunAt>[0]> = {}) => ({
  frequency: "monthly" as const,
  dayOfMonth: 16,
  dayOfWeek: null,
  monthOfYear: null,
  startDate: new Date("2026-05-16T00:00:00Z"),
  endDate: null,
  lastRunAt: null,
  ...overrides,
});

describe("computeNextRunAt — monthly", () => {
  it("primer schedule (lastRunAt=null) usa startDate sin avanzar", () => {
    const r = computeNextRunAt(monthlyTpl());
    expect(r?.toISOString().slice(0, 10)).toBe("2026-05-16");
  });

  it("con fromDate explícito (=hoy) avanza al próximo mes — FIX del bug", () => {
    const r = computeNextRunAt(
      monthlyTpl({ lastRunAt: null }),
      new Date("2026-05-16T00:00:00Z"),
    );
    expect(r?.toISOString().slice(0, 10)).toBe("2026-06-16");
  });

  it("retorna null si próximo > endDate", () => {
    const r = computeNextRunAt(
      monthlyTpl({ endDate: new Date("2026-06-01T00:00:00Z") }),
      new Date("2026-05-16T00:00:00Z"),
    );
    expect(r).toBeNull();
  });

  it("dayOfMonth=31 con mes destino abril → clampea a 30 (no salta a mayo)", () => {
    const r = computeNextRunAt(
      monthlyTpl({ dayOfMonth: 31, lastRunAt: new Date("2026-03-31T00:00:00Z") }),
    );
    expect(r?.toISOString().slice(0, 10)).toBe("2026-04-30");
  });

  it("dayOfMonth=-1 (último día) feb→mar = 31", () => {
    const r = computeNextRunAt(
      monthlyTpl({ dayOfMonth: -1, lastRunAt: new Date("2026-02-28T00:00:00Z") }),
    );
    expect(r?.toISOString().slice(0, 10)).toBe("2026-03-31");
  });
});

describe("computeNextRunAt — weekly/biweekly", () => {
  it("weekly avanza 7 días tras run", () => {
    const r = computeNextRunAt(
      {
        frequency: "weekly",
        dayOfMonth: null,
        dayOfWeek: 1,
        monthOfYear: null,
        startDate: new Date("2026-05-18T00:00:00Z"),
        endDate: null,
        lastRunAt: new Date("2026-05-18T00:00:00Z"),
      },
    );
    expect(r?.toISOString().slice(0, 10)).toBe("2026-05-25");
  });

  it("biweekly avanza 14 días tras run", () => {
    const r = computeNextRunAt(
      {
        frequency: "biweekly",
        dayOfMonth: null,
        dayOfWeek: 5,
        monthOfYear: null,
        startDate: new Date("2026-05-22T00:00:00Z"),
        endDate: null,
        lastRunAt: new Date("2026-05-22T00:00:00Z"),
      },
    );
    expect(r?.toISOString().slice(0, 10)).toBe("2026-06-05");
  });
});

describe("computeNextRunAt — yearly", () => {
  it("yearly avanza 1 año", () => {
    const r = computeNextRunAt({
      frequency: "yearly",
      dayOfMonth: 1,
      dayOfWeek: null,
      monthOfYear: 3,
      startDate: new Date("2026-03-01T00:00:00Z"),
      endDate: null,
      lastRunAt: new Date("2026-03-01T00:00:00Z"),
    });
    expect(r?.toISOString().slice(0, 10)).toBe("2027-03-01");
  });
});
