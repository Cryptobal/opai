import { describe, expect, it } from "vitest";
import {
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
});
