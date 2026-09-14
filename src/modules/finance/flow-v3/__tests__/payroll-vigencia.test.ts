import { describe, expect, it } from "vitest";
import type { PayrollCashSegment } from "@/modules/finance/cashflow/payroll-cash.service";
import {
  buildPayrollByMonth,
  intersectWindows,
  monthKeyAdd,
  monthKeysBetween,
  monthTotals,
  monthVigenciaFactor,
  OPEN_WINDOW,
  resolveInstallationWindows,
  type ServiceWindow,
} from "../payroll-vigencia";

function win(startYmd: string | null, endYmd: string | null = null): ServiceWindow {
  return { startYmd, endYmd, source: "template" };
}

function seg(over: Partial<PayrollCashSegment> = {}): PayrollCashSegment {
  return {
    puestoId: "p1",
    installationId: "inst-1",
    installationName: "Torre A",
    liquido: 600_000,
    previred: 150_000,
    impuestoUnico: 0,
    activeFromYmd: null,
    activeUntilYmd: null,
    ...over,
  };
}

describe("monthVigenciaFactor — base 30", () => {
  it("mes anterior al inicio → 0", () => {
    expect(monthVigenciaFactor(win("2026-09-20"), "2026-08")).toBe(0);
  });

  it("inicio el 20 → 11/30, igual en mes de 30 o 31 días", () => {
    expect(monthVigenciaFactor(win("2026-09-20"), "2026-09")).toBeCloseTo(11 / 30, 10);
    expect(monthVigenciaFactor(win("2026-10-20"), "2026-10")).toBeCloseTo(11 / 30, 10);
  });

  it("inicio el día 1 → mes completo, aunque el mes tenga 31 días", () => {
    expect(monthVigenciaFactor(win("2026-10-01"), "2026-10")).toBe(1);
  });

  it("meses siguientes al inicio → 1", () => {
    expect(monthVigenciaFactor(win("2026-09-20"), "2026-10")).toBe(1);
    expect(monthVigenciaFactor(win("2026-09-20"), "2027-03")).toBe(1);
  });

  it("término el 15 → 15/30; término el 30 de un mes de 31 → completo", () => {
    expect(monthVigenciaFactor(win(null, "2026-11-15"), "2026-11")).toBeCloseTo(0.5, 10);
    expect(monthVigenciaFactor(win(null, "2026-10-30"), "2026-10")).toBe(1);
  });

  it("mes posterior al término → 0", () => {
    expect(monthVigenciaFactor(win("2026-01-01", "2026-11-15"), "2026-12")).toBe(0);
  });

  it("inicio y término en el mismo mes → días cubiertos / 30", () => {
    expect(monthVigenciaFactor(win("2026-09-10", "2026-09-19"), "2026-09")).toBeCloseTo(10 / 30, 10);
  });

  it("inicio el 31 cuenta al menos un día (no 0)", () => {
    expect(monthVigenciaFactor(win("2026-10-31"), "2026-10")).toBeCloseTo(1 / 30, 10);
  });

  it("ventana abierta → 1 en cualquier mes", () => {
    expect(monthVigenciaFactor(OPEN_WINDOW, "2026-09")).toBe(1);
  });
});

describe("intersectWindows", () => {
  it("toma el inicio más tardío y el término más temprano", () => {
    const r = intersectWindows(win("2026-09-20", "2027-09-19"), {
      startYmd: "2026-10-05",
      endYmd: null,
      source: "none",
    });
    expect(r.startYmd).toBe("2026-10-05");
    expect(r.endYmd).toBe("2027-09-19");
    expect(r.source).toBe("template");
  });

  it("null en ambos lados = sin límite", () => {
    const r = intersectWindows(null, undefined);
    expect(r.startYmd).toBeNull();
    expect(r.endYmd).toBeNull();
  });
});

describe("monthKeyAdd / monthKeysBetween", () => {
  it("cruza el año", () => {
    expect(monthKeyAdd("2026-01", -1)).toBe("2025-12");
    expect(monthKeyAdd("2026-12", 1)).toBe("2027-01");
  });

  it("enumera inclusivo", () => {
    expect(monthKeysBetween("2026-11-20", "2027-01-05")).toEqual(["2026-11", "2026-12", "2027-01"]);
  });
});

describe("resolveInstallationWindows", () => {
  it("la programación manda: min(startDate), término abierto si alguna no tiene endDate", () => {
    const windows = resolveInstallationWindows(
      [
        { installationId: "inst-1", startDate: new Date("2026-10-01T00:00:00.000Z"), endDate: new Date("2027-09-30T00:00:00.000Z") },
        { installationId: "inst-1", startDate: new Date("2026-09-20T00:00:00.000Z"), endDate: null },
        { installationId: null, startDate: new Date("2026-01-01T00:00:00.000Z"), endDate: null },
      ],
      [{ id: "inst-1", startDate: new Date("2026-01-01T00:00:00.000Z"), endDate: null }],
    );
    const w = windows.get("inst-1");
    expect(w?.startYmd).toBe("2026-09-20");
    expect(w?.endYmd).toBeNull();
    expect(w?.source).toBe("template");
  });

  it("sin programación cae a las fechas de la instalación; sin nada → sin ventana", () => {
    const windows = resolveInstallationWindows(
      [],
      [
        { id: "inst-a", startDate: "2026-11-15", endDate: "2027-11-14" },
        { id: "inst-b", startDate: null, endDate: null },
      ],
    );
    expect(windows.get("inst-a")).toEqual({ startYmd: "2026-11-15", endYmd: "2027-11-14", source: "installation" });
    expect(windows.has("inst-b")).toBe(false);
  });

  it("todas las programaciones con endDate → max(endDate)", () => {
    const windows = resolveInstallationWindows(
      [
        { installationId: "inst-1", startDate: "2026-09-01", endDate: "2027-03-31" },
        { installationId: "inst-1", startDate: "2026-09-01", endDate: "2027-08-31" },
      ],
      [],
    );
    expect(windows.get("inst-1")?.endYmd).toBe("2027-08-31");
  });
});

describe("buildPayrollByMonth", () => {
  const months = ["2026-08", "2026-09", "2026-10", "2026-11"];

  it("inicio el 20-09: agosto 0, septiembre 11/30, octubre completo", () => {
    const r = buildPayrollByMonth([seg()], new Map([["inst-1", win("2026-09-20")]]), months);
    expect(monthTotals(r, "2026-08")).toEqual({ liquido: 0, previred: 0, impuestoUnico: 0 });
    expect(monthTotals(r, "2026-09")).toEqual({
      liquido: Math.round(600_000 * (11 / 30)),
      previred: Math.round(150_000 * (11 / 30)),
      impuestoUnico: 0,
    });
    expect(monthTotals(r, "2026-10")).toEqual({ liquido: 600_000, previred: 150_000, impuestoUnico: 0 });
    expect(r.notes.get("2026-09")).toEqual(["Torre A desde 20-09 (11/30)"]);
    expect(r.notes.get("2026-10")).toBeUndefined();
    expect(r.byInstallation.get("inst-1")?.get("2026-09")?.factor).toBeCloseTo(11 / 30, 10);
  });

  it("sin ventana ni activeFrom → foto plana (comportamiento histórico)", () => {
    const r = buildPayrollByMonth([seg(), seg({ puestoId: "p2", installationId: "inst-2", installationName: "B" })], new Map(), months);
    for (const m of months) {
      expect(monthTotals(r, m)).toEqual({ liquido: 1_200_000, previred: 300_000, impuestoUnico: 0 });
    }
    expect(r.notes.size).toBe(0);
  });

  it("activeFrom del puesto se intersecta con la ventana de la instalación", () => {
    const r = buildPayrollByMonth(
      [seg(), seg({ puestoId: "refuerzo", liquido: 300_000, previred: 60_000, activeFromYmd: "2026-10-16" })],
      new Map([["inst-1", win("2026-09-01")]]),
      months,
    );
    // Septiembre: solo el puesto base (el refuerzo aún no existe).
    expect(monthTotals(r, "2026-09")).toEqual({ liquido: 600_000, previred: 150_000, impuestoUnico: 0 });
    // Octubre: base completo + refuerzo 15/30.
    expect(monthTotals(r, "2026-10")).toEqual({
      liquido: 600_000 + 150_000,
      previred: 150_000 + 30_000,
      impuestoUnico: 0,
    });
    expect(monthTotals(r, "2026-11")).toEqual({ liquido: 900_000, previred: 210_000, impuestoUnico: 0 });
    expect(r.notes.get("2026-10")?.[0]).toMatch(/^Torre A parcial \(25\/30\)$/);
  });

  it("término del contrato el 15-11 → noviembre 15/30 y nota 'hasta'", () => {
    const r = buildPayrollByMonth([seg()], new Map([["inst-1", win("2026-01-01", "2026-11-15")]]), months);
    expect(monthTotals(r, "2026-10").liquido).toBe(600_000);
    expect(monthTotals(r, "2026-11").liquido).toBe(300_000);
    expect(r.notes.get("2026-11")).toEqual(["Torre A hasta 15-11 (15/30)"]);
  });

  it("mes fuera del horizonte → 0 seguro", () => {
    const r = buildPayrollByMonth([seg()], new Map(), months);
    expect(monthTotals(r, "2030-01")).toEqual({ liquido: 0, previred: 0, impuestoUnico: 0 });
  });
});
