import { describe, expect, it } from "vitest";
import {
  computePeakStaffing,
  shiftHours,
  staffingForCoverageSlot,
  sumStaffing,
} from "@/lib/crm/coverage-to-staffing";

describe("coverage-to-staffing", () => {
  it("calcula horas de turno que cruza medianoche", () => {
    expect(shiftHours("20:00", "08:00")).toBe(12);
    expect(shiftHours("07:30", "19:30")).toBe(12);
    expect(shiftHours("12:00", "15:00")).toBe(3);
  });

  it("24/7 por turno (día o noche) → 2 por simultáneo en 4x4", () => {
    const day = staffingForCoverageSlot({
      simultaneous: 5,
      dias: ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"],
      horaInicio: "08:00",
      horaFin: "20:00",
      regimen: "24/7",
    });
    expect(day.headcount).toBe(10);
    expect(day.pattern).toBe("4x4");
  });

  it("slot único 24h → 4 por simultáneo", () => {
    const full = staffingForCoverageSlot({
      simultaneous: 1,
      dias: ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"],
      horaInicio: "00:00",
      horaFin: "00:00",
      regimen: "24/7",
    });
    expect(full.headcount).toBe(4);
    expect(full.pattern).toBe("4x4");
  });

  it("L-V 12h → pool 42h (2 para 1 simultáneo)", () => {
    const slot = staffingForCoverageSlot({
      simultaneous: 1,
      dias: ["lunes", "martes", "miercoles", "jueves", "viernes"],
      horaInicio: "07:30",
      horaFin: "19:30",
    });
    expect(slot.weeklyHH).toBe(60);
    expect(slot.headcount).toBe(2);
    expect(slot.pattern).toBe("pool_42h");
  });

  it("jornada parcial ≤42h → cobertura = dotación", () => {
    const slot = staffingForCoverageSlot({
      simultaneous: 1,
      dias: ["lunes", "martes", "miercoles", "jueves", "viernes"],
      horaInicio: "12:00",
      horaFin: "15:00",
    });
    expect(slot.weeklyHH).toBe(15);
    expect(slot.headcount).toBe(1);
    expect(slot.pattern).toBe("parcial");
  });

  it("suma MINSAL-like: 7 turnos 24/7 + diurnos", () => {
    const week = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];
    const lv = ["lunes", "martes", "miercoles", "jueves", "viernes"];
    const slots = [
      // 5+1+1 día y 5+1+1 noche = 7 turnos 24/7
      ...Array.from({ length: 7 }, () =>
        staffingForCoverageSlot({
          simultaneous: 1,
          dias: week,
          horaInicio: "08:00",
          horaFin: "20:00",
          regimen: "24/7",
        }),
      ),
      staffingForCoverageSlot({
        simultaneous: 1,
        dias: week,
        horaInicio: "07:30",
        horaFin: "19:30",
      }), // vacunatorio
    ];
    const totals = sumStaffing(slots, 42, 0.1);
    expect(totals.headcountBase).toBe(7 * 2 + 2); // 16
    expect(totals.legalMinimum).toBeGreaterThan(0);
    expect(totals.headcountWithReserve).toBeGreaterThan(totals.headcountBase);
  });

  describe("computePeakStaffing", () => {
    it("ITJC sintético: sep=6; peak en traslape 3A/3B", () => {
      const slots = [
        // E1 + E2 (sep): 2+2+2 = 6
        { headcount: 2, weeklyHH: 84, vigenciaDesde: "2026-09-01", vigenciaHasta: "2026-09-30" },
        { headcount: 2, weeklyHH: 84, vigenciaDesde: "2026-09-01", vigenciaHasta: "2026-09-30" },
        { headcount: 2, weeklyHH: 84, vigenciaDesde: "2026-09-01", vigenciaHasta: "2026-09-30" },
        // E3A oct–nov: 12
        { headcount: 12, weeklyHH: 1008, vigenciaDesde: "2026-10-01", vigenciaHasta: "2026-11-30" },
        // E3B 15-nov → 29-ene: 4
        { headcount: 4, weeklyHH: 336, vigenciaDesde: "2026-11-15", vigenciaHasta: "2027-01-29" },
      ];
      const peak = computePeakStaffing(slots);
      expect(peak).not.toBeNull();
      expect(peak!.peakHeadcount).toBe(16); // 12+4, no la suma total 22
      expect(peak!.peakFrom).toBe("2026-11-15");
      expect(peak!.peakTo).toBe("2026-11-30");
      // En sep el concurrente es 6 (menor que peak).
      const sepOnly = computePeakStaffing(slots.slice(0, 3));
      expect(sepOnly!.peakHeadcount).toBe(6);
    });

    it("sin vigencias → null", () => {
      expect(
        computePeakStaffing([
          { headcount: 4, weeklyHH: 168 },
          { headcount: 2, weeklyHH: 84 },
        ]),
      ).toBeNull();
    });

    it("fechas cruzadas (desde>hasta) se tratan como sin vigencia", () => {
      const peak = computePeakStaffing([
        { headcount: 3, weeklyHH: 100, vigenciaDesde: "2026-12-01", vigenciaHasta: "2026-11-01" },
        { headcount: 2, weeklyHH: 80, vigenciaDesde: "2026-10-01", vigenciaHasta: "2026-10-31" },
      ]);
      // Solo el segundo tiene vigencia válida; el cruzado cuenta en todo el rango.
      expect(peak).not.toBeNull();
      expect(peak!.peakHeadcount).toBe(5);
      expect(peak!.peakFrom).toBe("2026-10-01");
      expect(peak!.peakTo).toBe("2026-10-31");
    });

    it("slots mixtos: sin vigencia cuentan en todo el rango", () => {
      const peak = computePeakStaffing([
        { headcount: 2, weeklyHH: 84 }, // open
        { headcount: 4, weeklyHH: 168, vigenciaDesde: "2026-01-01", vigenciaHasta: "2026-01-10" },
        { headcount: 1, weeklyHH: 42, vigenciaDesde: "2026-01-05", vigenciaHasta: "2026-01-20" },
      ]);
      expect(peak!.peakHeadcount).toBe(7); // 2+4+1 en 5–10 ene
      expect(peak!.peakFrom).toBe("2026-01-05");
      expect(peak!.peakTo).toBe("2026-01-10");
    });
  });
});
