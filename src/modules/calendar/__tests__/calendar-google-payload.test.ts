import { describe, it, expect } from "vitest";
import { fromZonedTime } from "date-fns-tz";
import { CHILE_TZ } from "@/lib/dates-cl";
import {
  buildCalendarEventGooglePayload,
  chileAllDayStartEnd,
  chileDateTimePayload,
} from "../calendar-google-payload";

function chileLocal(y: number, m: number, d: number, h = 0, min = 0): Date {
  return fromZonedTime(new Date(y, m - 1, d, h, min, 0, 0), CHILE_TZ);
}

describe("chileAllDayStartEnd", () => {
  it("all-day de un día → end exclusivo = día siguiente", () => {
    const start = chileLocal(2026, 8, 10, 0, 0);
    const end = chileLocal(2026, 8, 10, 23, 59);
    const r = chileAllDayStartEnd(start, end);
    expect(r.start.date).toBe("2026-08-10");
    expect(r.end.date).toBe("2026-08-11");
  });

  it("all-day multi-día → rango exclusivo correcto", () => {
    const start = chileLocal(2026, 8, 10, 0, 0);
    const end = chileLocal(2026, 8, 15, 23, 59);
    const r = chileAllDayStartEnd(start, end);
    expect(r.start.date).toBe("2026-08-10");
    expect(r.end.date).toBe("2026-08-16");
  });
});

describe("chileDateTimePayload", () => {
  it("emite offset Chile explícito (invierno −04:00)", () => {
    // Agosto → horario de invierno Chile típico −04:00
    const d = chileLocal(2026, 8, 10, 9, 0);
    const p = chileDateTimePayload(d);
    expect(p.timeZone).toBe("America/Santiago");
    expect(p.dateTime).toMatch(/^2026-08-10T09:00:00-0[34]:00$/);
  });

  it("emite offset Chile en verano (−03:00) alrededor de enero", () => {
    const d = chileLocal(2026, 1, 15, 14, 30);
    const p = chileDateTimePayload(d);
    expect(p.dateTime).toMatch(/^2026-01-15T14:30:00-0[34]:00$/);
  });
});

describe("buildCalendarEventGooglePayload", () => {
  it("arma attendees internos + externos y all-day Chile", () => {
    const start = chileLocal(2026, 8, 10, 0, 0);
    const end = chileLocal(2026, 8, 10, 23, 59);
    const body = buildCalendarEventGooglePayload(
      {
        title: "Banda",
        description: "Ver en OPAI: https://example.test/opai/agenda?visita=x",
        location: null,
        startAt: start,
        endAt: end,
        allDay: true,
        externals: [{ email: "cliente@ejemplo.cl", optional: false }],
      },
      ["hugo@gard.cl"],
    );
    expect(body.start).toEqual({ date: "2026-08-10" });
    expect(body.end).toEqual({ date: "2026-08-11" });
    expect(body.attendees?.map((a) => a.email)).toEqual([
      "hugo@gard.cl",
      "cliente@ejemplo.cl",
    ]);
  });
});
