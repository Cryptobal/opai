import { describe, expect, it } from "vitest";
import {
  dayAttendanceTone,
  resolveDayAttendanceStatus,
} from "../pauta-mensual-day-status";

const TODAY = "2026-08-19";

describe("resolveDayAttendanceStatus", () => {
  it("no colorea días futuros aunque haya slots planificados", () => {
    expect(
      resolveDayAttendanceStatus({
        dateKey: "2026-08-20",
        todayKey: TODAY,
        planned: 4,
        resolved: 0,
      }),
    ).toBe("future");
    expect(
      resolveDayAttendanceStatus({
        dateKey: "2026-08-31",
        todayKey: TODAY,
        planned: 4,
        resolved: 2,
      }),
    ).toBe("future");
  });

  it("marca verde cuando el día (hoy o pasado) tiene todos los puestos resueltos", () => {
    expect(
      resolveDayAttendanceStatus({
        dateKey: "2026-08-18",
        todayKey: TODAY,
        planned: 4,
        resolved: 4,
      }),
    ).toBe("ok");
    expect(
      resolveDayAttendanceStatus({
        dateKey: TODAY,
        todayKey: TODAY,
        planned: 2,
        resolved: 2,
      }),
    ).toBe("ok");
  });

  it("marca ámbar cuando faltan asistencias (pasado parcial u hoy sin marcas)", () => {
    expect(
      resolveDayAttendanceStatus({
        dateKey: "2026-08-10",
        todayKey: TODAY,
        planned: 4,
        resolved: 1,
      }),
    ).toBe("partial");
    expect(
      resolveDayAttendanceStatus({
        dateKey: TODAY,
        todayKey: TODAY,
        planned: 4,
        resolved: 0,
      }),
    ).toBe("partial");
  });

  it("marca rojo solo si el día ya pasó y no hay ninguna asistencia", () => {
    expect(
      resolveDayAttendanceStatus({
        dateKey: "2026-08-04",
        todayKey: TODAY,
        planned: 4,
        resolved: 0,
      }),
    ).toBe("pending");
  });

  it("deja neutro un día pasado sin turnos planificados", () => {
    expect(
      resolveDayAttendanceStatus({
        dateKey: "2026-08-01",
        todayKey: TODAY,
        planned: 0,
        resolved: 0,
      }),
    ).toBe("none");
  });
});

describe("dayAttendanceTone", () => {
  it("usa tokens de peligro para días pasados sin asistencia", () => {
    const tone = dayAttendanceTone("pending");
    expect(tone.label).toBe("sin asistencia");
    expect(tone.buttonClass).toContain("status-danger");
  });

  it("deja futuro y sin turnos sin tinte", () => {
    expect(dayAttendanceTone("future").buttonClass).toContain("bg-transparent");
    expect(dayAttendanceTone("none").buttonClass).toContain("bg-transparent");
  });
});
