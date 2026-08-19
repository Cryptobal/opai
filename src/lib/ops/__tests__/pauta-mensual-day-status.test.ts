import { describe, expect, it } from "vitest";
import {
  dayAttendanceTone,
  isAttendedExecution,
  resolveDayAttendanceStatus,
} from "../pauta-mensual-day-status";

const TODAY = "2026-08-19";

describe("resolveDayAttendanceStatus", () => {
  it("no marca días futuros aunque haya slots planificados", () => {
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

  it("marca ok cuando el día (hoy o pasado) tiene todos los puestos resueltos", () => {
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

  it("marca parcial cuando faltan asistencias (pasado parcial u hoy sin marcas)", () => {
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

  it("marca pending solo si el día ya pasó y no hay ninguna asistencia", () => {
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

  it("un día pasado con turnos pero 0 ASI/TE es rojo aunque haya PPC o SC", () => {
    const planned = 2;
    const executions = ["ppc", "sin_cobertura"] as const;
    const resolved = executions.filter(isAttendedExecution).length;
    expect(resolved).toBe(0);
    expect(
      resolveDayAttendanceStatus({
        dateKey: "2026-08-01",
        todayKey: TODAY,
        planned,
        resolved,
      }),
    ).toBe("pending");
  });
});

describe("isAttendedExecution", () => {
  it("solo ASI y TE cubren el turno", () => {
    expect(isAttendedExecution("asistio")).toBe(true);
    expect(isAttendedExecution("te")).toBe(true);
    expect(isAttendedExecution("ppc")).toBe(false);
    expect(isAttendedExecution("sin_cobertura")).toBe(false);
    expect(isAttendedExecution(undefined)).toBe(false);
    expect(isAttendedExecution(null)).toBe(false);
  });
});

describe("dayAttendanceTone", () => {
  it("expone un punto de semáforo y no clases de fill del día", () => {
    expect(dayAttendanceTone("ok")).toEqual({ label: "completa", dotKind: "ok" });
    expect(dayAttendanceTone("partial")).toEqual({ label: "parcial", dotKind: "warn" });
    expect(dayAttendanceTone("pending")).toEqual({ label: "sin asistencia", dotKind: "danger" });
  });

  it("no muestra punto en futuro ni en días sin turnos", () => {
    expect(dayAttendanceTone("future").dotKind).toBeNull();
    expect(dayAttendanceTone("none").dotKind).toBeNull();
  });
});
