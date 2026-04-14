// @vitest-environment node
import { describe, it, expect } from "vitest";
import { buildScheduleSlots } from "../schedule-engine";

// Helper: create a UTC date for a specific Chile time
// Chile is UTC-3 (summer) or UTC-4 (winter)
function utcDate(iso: string): Date {
  return new Date(iso);
}

describe("buildScheduleSlots", () => {
  it("returns empty array when frecuenciaMinutos is 0", () => {
    const slots = buildScheduleSlots({
      from: utcDate("2026-04-14T00:00:00Z"),
      to: utcDate("2026-04-14T23:59:59Z"),
      diasSemana: [0, 1, 2, 3, 4, 5, 6],
      horaInicio: "08:00",
      horaFin: "18:00",
      frecuenciaMinutos: 0,
    });
    expect(slots).toEqual([]);
  });

  it("returns empty array when frecuenciaMinutos is negative", () => {
    const slots = buildScheduleSlots({
      from: utcDate("2026-04-14T00:00:00Z"),
      to: utcDate("2026-04-14T23:59:59Z"),
      diasSemana: [0, 1, 2, 3, 4, 5, 6],
      horaInicio: "08:00",
      horaFin: "18:00",
      frecuenciaMinutos: -10,
    });
    expect(slots).toEqual([]);
  });

  it("generates slots at correct frequency intervals", () => {
    // 08:00-10:00 with 60min frequency → 2 slots: 08:00, 09:00
    const slots = buildScheduleSlots({
      from: utcDate("2026-04-14T00:00:00Z"),
      to: utcDate("2026-04-14T23:59:59Z"),
      diasSemana: [0, 1, 2, 3, 4, 5, 6],
      horaInicio: "08:00",
      horaFin: "10:00",
      frecuenciaMinutos: 60,
    });
    expect(slots.length).toBe(2);
  });

  it("does not generate slots for days not in diasSemana", () => {
    // April 14, 2026 is a Tuesday (day 2)
    const slots = buildScheduleSlots({
      from: utcDate("2026-04-14T00:00:00Z"),
      to: utcDate("2026-04-14T23:59:59Z"),
      diasSemana: [0], // Only Sunday
      horaInicio: "08:00",
      horaFin: "18:00",
      frecuenciaMinutos: 60,
    });
    expect(slots).toEqual([]);
  });

  it("generates slots only within the from-to range", () => {
    const slots = buildScheduleSlots({
      from: utcDate("2026-04-14T14:00:00Z"),
      to: utcDate("2026-04-14T16:00:00Z"),
      diasSemana: [0, 1, 2, 3, 4, 5, 6],
      horaInicio: "08:00",
      horaFin: "18:00",
      frecuenciaMinutos: 60,
    });
    // Only slots within 14:00-16:00 UTC should be returned
    for (const slot of slots) {
      expect(slot.getTime()).toBeGreaterThanOrEqual(utcDate("2026-04-14T14:00:00Z").getTime());
      expect(slot.getTime()).toBeLessThanOrEqual(utcDate("2026-04-14T16:00:00Z").getTime());
    }
  });

  it("handles overnight windows (e.g., 22:00 to 06:00)", () => {
    const slots = buildScheduleSlots({
      from: utcDate("2026-04-14T00:00:00Z"),
      to: utcDate("2026-04-15T23:59:59Z"),
      diasSemana: [0, 1, 2, 3, 4, 5, 6],
      horaInicio: "22:00",
      horaFin: "06:00",
      frecuenciaMinutos: 120,
    });
    // Should have 4 slots per qualifying day: 22:00, 00:00, 02:00, 04:00
    expect(slots.length).toBeGreaterThan(0);
  });

  describe("custom schedules (horariosCustom)", () => {
    it("generates slots at custom times", () => {
      const slots = buildScheduleSlots({
        from: utcDate("2026-04-14T00:00:00Z"),
        to: utcDate("2026-04-14T23:59:59Z"),
        diasSemana: [0, 1, 2, 3, 4, 5, 6],
        horaInicio: "08:00",
        horaFin: "18:00",
        frecuenciaMinutos: 60, // ignored when custom
        horariosCustom: ["09:00", "12:00", "15:00"],
      });
      expect(slots.length).toBe(3);
    });

    it("ignores custom times outside the window", () => {
      const slots = buildScheduleSlots({
        from: utcDate("2026-04-14T00:00:00Z"),
        to: utcDate("2026-04-14T23:59:59Z"),
        diasSemana: [0, 1, 2, 3, 4, 5, 6],
        horaInicio: "08:00",
        horaFin: "12:00",
        frecuenciaMinutos: 60,
        horariosCustom: ["07:00", "09:00", "13:00"],
      });
      // Only 09:00 is within 08:00-12:00
      expect(slots.length).toBe(1);
    });

    it("handles overnight custom times", () => {
      const slots = buildScheduleSlots({
        from: utcDate("2026-04-14T00:00:00Z"),
        to: utcDate("2026-04-15T23:59:59Z"),
        diasSemana: [0, 1, 2, 3, 4, 5, 6],
        horaInicio: "22:00",
        horaFin: "06:00",
        frecuenciaMinutos: 60,
        horariosCustom: ["22:00", "01:00", "04:00"],
      });
      expect(slots.length).toBeGreaterThan(0);
    });

    it("ignores empty horariosCustom array", () => {
      const slotsWithEmpty = buildScheduleSlots({
        from: utcDate("2026-04-14T00:00:00Z"),
        to: utcDate("2026-04-14T23:59:59Z"),
        diasSemana: [0, 1, 2, 3, 4, 5, 6],
        horaInicio: "08:00",
        horaFin: "10:00",
        frecuenciaMinutos: 60,
        horariosCustom: [],
      });
      // Falls back to frequency mode
      expect(slotsWithEmpty.length).toBe(2);
    });
  });
});
