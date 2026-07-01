import { describe, it, expect } from "vitest";
import {
  analizarJornada,
  durHoras,
  DEFAULT_LIMITS,
  MAX_HORAS_DIARIA_ORDINARIA,
} from "../jornada-calc";

const DIAS_LUNVIE = ["Lun", "Mar", "Mié", "Jue", "Vie"];

describe("durHoras", () => {
  it("calcula un span normal", () => {
    expect(durHoras("08:00", "18:30")).toBe(10.5);
  });
  it("cruza medianoche en turno nocturno", () => {
    expect(durHoras("20:00", "08:00")).toBe(12);
  });
});

describe("analizarJornada — régimen ordinario (5x2)", () => {
  it("descuenta colación y detecta horas extra sobre 42h", () => {
    // 08:00–18:30 = 10.5h reloj; −1h colación = 9.5h efectivas; ×5 = 47.5h/sem
    const a = analizarJornada({
      inicio: "08:00",
      fin: "18:30",
      dias: DIAS_LUNVIE,
      colacionMin: 60,
      regimen: "ordinaria",
    });
    expect(a.regimen).toBe("ordinaria");
    expect(a.horasReloj).toBe(10.5);
    expect(a.horasEfectivasDia).toBe(9.5);
    expect(a.diasSemana).toBe(5);
    expect(a.horasSemana).toBe(47.5);
    expect(a.topeSemanal).toBe(42);
    expect(a.horasExtraSemana).toBe(5.5);
    expect(a.topeDiario).toBe(MAX_HORAS_DIARIA_ORDINARIA);
    // 9.5h/día < 10h (ok), 5.5/5 = 1.1h extra/día < 2h → sólo warn "hay_extra"
    expect(a.alertas.map((x) => x.codigo)).toEqual(["hay_extra"]);
  });

  it("no marca extra cuando la jornada cabe en 42h", () => {
    // 08:00–17:00 = 9h reloj; −1h = 8h efectivas; ×5 = 40h/sem ≤ 42
    const a = analizarJornada({
      inicio: "08:00",
      fin: "17:00",
      dias: DIAS_LUNVIE,
      colacionMin: 60,
      regimen: "ordinaria",
    });
    expect(a.horasSemana).toBe(40);
    expect(a.horasExtraSemana).toBe(0);
    expect(a.alertas).toEqual([]);
  });

  it("marca error si la jornada diaria efectiva supera 10h", () => {
    // 08:00–19:30 = 11.5h reloj; −0.5h = 11h efectivas > 10
    const a = analizarJornada({
      inicio: "08:00",
      fin: "19:30",
      dias: DIAS_LUNVIE,
      colacionMin: 30,
      regimen: "ordinaria",
    });
    expect(a.horasEfectivasDia).toBe(11);
    expect(a.alertas.some((x) => x.codigo === "tope_diario" && x.nivel === "error")).toBe(true);
  });

  it("marca error si el promedio de extra supera 2h/día", () => {
    // 08:00–20:30 = 12.5h reloj; −0.5 = 12h efec; ×5 = 60h/sem; extra 18/5 = 3.6h/día
    const a = analizarJornada({
      inicio: "08:00",
      fin: "20:30",
      dias: DIAS_LUNVIE,
      colacionMin: 30,
      regimen: "ordinaria",
    });
    expect(a.horasExtraSemana).toBe(18);
    expect(a.alertas.some((x) => x.codigo === "extra_diaria" && x.nivel === "error")).toBe(true);
  });

  it("usa 42h por defecto y respeta límites custom (40h)", () => {
    const a = analizarJornada({
      inicio: "08:00",
      fin: "17:00",
      dias: DIAS_LUNVIE,
      colacionMin: 60,
      regimen: "ordinaria",
      limites: { ...DEFAULT_LIMITS, maxHorasSemanales: 40 },
    });
    // 40h/sem contra tope 40 → sin extra aún
    expect(a.topeSemanal).toBe(40);
    expect(a.horasExtraSemana).toBe(0);
  });
});

describe("analizarJornada — régimen excepcional (4x4, 7x7)", () => {
  it("4x4 de 12h promedia 42h/sem sin extra", () => {
    // 20:00–08:00 = 12h reloj; sin colación imputable en excepcional → 12h efec
    // ciclo 4x4 = 8 días = 8/7 semanas; 4×12 = 48h totales; 48/(8/7) = 42h prom
    const a = analizarJornada({
      inicio: "20:00",
      fin: "08:00",
      dias: [],
      colacionMin: 0,
      regimen: "excepcional",
      ciclo: { diasTrabajo: 4, diasDescanso: 4 },
    });
    expect(a.regimen).toBe("excepcional");
    expect(a.horasEfectivasDia).toBe(12);
    expect(a.horasSemana).toBe(42);
    expect(a.horasExtraSemana).toBe(0);
    expect(a.topeDiario).toBe(12);
    expect(a.alertas.some((x) => x.codigo === "requiere_autorizacion_dt")).toBe(true);
    expect(a.alertas.some((x) => x.nivel === "error")).toBe(false);
  });

  it("marca error si el promedio del ciclo supera 42h", () => {
    // 7x7 de 12h: 7×12 = 84h; ciclo 14 días = 2 semanas; prom 42 → ok
    // pero 6x6 de 12h: 6×12=72h; ciclo 12 días = 12/7 sem; 72/(12/7)=42 → ok
    // forzamos exceso: 5x5 de 12h → 60h/(10/7)=42 ok; usamos 4x2 de 12h
    const a = analizarJornada({
      inicio: "20:00",
      fin: "08:00",
      dias: [],
      colacionMin: 0,
      regimen: "excepcional",
      ciclo: { diasTrabajo: 4, diasDescanso: 2 },
    });
    // 4×12 = 48h; ciclo 6 días = 6/7 sem; 48/(6/7) = 56h prom > 42
    expect(a.horasSemana).toBeGreaterThan(42);
    expect(a.alertas.some((x) => x.codigo === "excepcional_promedio" && x.nivel === "error")).toBe(true);
  });
});
