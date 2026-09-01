import { describe, expect, it } from "vitest";
import { matchesWorkerQuery, parseDtFilters, resolvedRange, turnoKey } from "../filters";

describe("parseDtFilters", () => {
  it("acepta filtros combinables en cualquier orden", () => {
    const a = parseDtFilters(
      new URLSearchParams({
        from: "2026-01-10",
        to: "2026-01-20",
        installationIds: "inst-1",
        turnos: "08:00 a 16:00",
        jornada: "ordinaria",
      }),
    );
    const b = parseDtFilters(
      new URLSearchParams({
        jornada: "ordinaria",
        turnos: "08:00 a 16:00",
        installationIds: "inst-1",
        to: "2026-01-20",
        from: "2026-01-10",
      }),
    );
    expect(a).toEqual(b);
    expect(a.from).toBe("2026-01-10");
    expect(a.to).toBe("2026-01-20");
    expect(a.jornada).toBe("ordinaria");
  });

  it("normaliza búsqueda de trabajador por RUT sin puntos con guión", () => {
    const f = parseDtFilters(new URLSearchParams({ trabajador: "12.345.678-5" }));
    expect(f.workerQuery).toBe("12.345.678-5");
    expect(
      matchesWorkerQuery({ firstName: "Juan", lastName: "Perez", rut: "12.345.678-5" }, "12345678-5"),
    ).toBe(true);
    expect(
      matchesWorkerQuery({ firstName: "Juan", lastName: "Perez", rut: "12345678-5" }, "12.345.678-5"),
    ).toBe(true);
  });

  it("arma clave de turno HH:MM a HH:MM", () => {
    expect(turnoKey("08:00", "16:00")).toBe("08:00 a 16:00");
  });

  it("prioriza from/to explícitos sobre el periodo predefinido", () => {
    const filters = parseDtFilters(
      new URLSearchParams({
        periodo: "ultima_semana",
        from: "2024-01-01",
        to: "2024-01-31",
      }),
    );
    expect(resolvedRange(filters)).toEqual({ from: "2024-01-01", to: "2024-01-31" });
  });
});
