import { describe, expect, it } from "vitest";
import {
  coverageSlotTracePrefix,
  preferredRolName,
} from "../coverage-slots-to-quote-positions";
import { resolveSlotBaseSalary } from "../resolve-slot-base-salary";

describe("coverageSlotTracePrefix", () => {
  it("antepone etapa y vigencia", () => {
    expect(
      coverageSlotTracePrefix({
        etapa: "Etapa 1",
        vigenciaDesde: "2026-09-01",
        vigenciaHasta: "2026-09-30",
      }),
    ).toBe("[Etapa 1 · 2026-09-01→2026-09-30] ");
  });

  it("sin campos → string vacío", () => {
    expect(coverageSlotTracePrefix({})).toBe("");
    expect(coverageSlotTracePrefix({ etapa: null })).toBe("");
  });
});

describe("preferredRolName", () => {
  it("mapea 24/7 y continuo a 4x4", () => {
    expect(preferredRolName("24/7")).toBe("4x4");
    expect(preferredRolName("24x7")).toBe("4x4");
    expect(preferredRolName("Continuo 24h")).toBe("4x4");
  });

  it("respeta 4x4 y 7x7 explícitos", () => {
    expect(preferredRolName("4x4")).toBe("4x4");
    expect(preferredRolName("7x7")).toBe("7x7");
    expect(preferredRolName("7/7")).toBe("7x7");
  });

  it("mapea 5x2", () => {
    expect(preferredRolName("5x2")).toBe("5x2");
  });

  it("null / vacío → null", () => {
    expect(preferredRolName(null)).toBeNull();
    expect(preferredRolName(undefined)).toBeNull();
    expect(preferredRolName("")).toBeNull();
  });
});

describe("resolveSlotBaseSalary", () => {
  it("prioriza bruto del puesto sobre piso del pliego", () => {
    expect(resolveSlotBaseSalary(600000, 500000)).toBe(600000);
  });

  it("usa piso del pliego si el puesto no tiene bruto", () => {
    expect(resolveSlotBaseSalary(null, 620000)).toBe(620000);
    expect(resolveSlotBaseSalary(undefined, 620000)).toBe(620000);
    expect(resolveSlotBaseSalary(0, 620000)).toBe(620000);
  });

  it("cae al default interno si no hay piso ni bruto", () => {
    expect(resolveSlotBaseSalary(null, null)).toBe(550000);
    expect(resolveSlotBaseSalary(undefined, undefined, 400000)).toBe(400000);
  });
});
