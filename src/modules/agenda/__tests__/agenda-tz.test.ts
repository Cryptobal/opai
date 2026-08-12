/**
 * Tests de zona horaria (audit B5/B6) incluyendo los cambios DST de Chile 2026:
 * - 2026-04-05: termina el horario de verano (offset -03 → -04).
 * - 2026-09-06: comienza el horario de verano (offset -04 → -03).
 */
import { describe, it, expect } from "vitest";
import {
  agendaItemDayKey,
  dateAtChileSlot,
  minutesInChile,
} from "@/components/agenda/agenda-calendar-utils";
import { ymdInChile } from "@/lib/dates-cl";
import { isoFromEventDate } from "@/modules/agenda/google-events-helpers";
import { buildVisitaEventPayload } from "@/lib/google-workspace/calendar-payloads";
import { isAgendaVisitaAllDay } from "@/modules/agenda/agenda-sync";

describe("dateAtChileSlot — ancla a America/Santiago", () => {
  it("día del fin de DST (2026-04-05, -04): 09:00 Chile = 13:00 UTC", () => {
    const d = dateAtChileSlot("2026-04-05", 9 * 60);
    expect(d.toISOString()).toBe("2026-04-05T13:00:00.000Z");
  });

  it("día previo al fin de DST (2026-04-04, -03): 09:00 Chile = 12:00 UTC", () => {
    const d = dateAtChileSlot("2026-04-04", 9 * 60);
    expect(d.toISOString()).toBe("2026-04-04T12:00:00.000Z");
  });

  it("día del inicio de DST (2026-09-06, -03): 09:00 Chile = 12:00 UTC", () => {
    const d = dateAtChileSlot("2026-09-06", 9 * 60);
    expect(d.toISOString()).toBe("2026-09-06T12:00:00.000Z");
  });

  it("día previo al inicio de DST (2026-09-05, -04): 09:00 Chile = 13:00 UTC", () => {
    const d = dateAtChileSlot("2026-09-05", 9 * 60);
    expect(d.toISOString()).toBe("2026-09-05T13:00:00.000Z");
  });

  it("round-trip: minutos y ymd se conservan en fechas de cambio", () => {
    for (const ymd of ["2026-04-05", "2026-09-06", "2026-07-22"]) {
      const d = dateAtChileSlot(ymd, 15 * 60 + 30);
      expect(minutesInChile(d)).toBe(15 * 60 + 30);
      expect(ymdInChile(d)).toBe(ymd);
    }
  });
});

describe("isoFromEventDate — all-day sin zona ambigua (B6)", () => {
  it("all-day devuelve ymd puro y allDay:true", () => {
    expect(isoFromEventDate({ date: "2026-07-22" })).toEqual({
      iso: "2026-07-22",
      allDay: true,
    });
  });

  it("timed devuelve el dateTime tal cual", () => {
    expect(isoFromEventDate({ dateTime: "2026-07-22T12:00:00-04:00" })).toEqual({
      iso: "2026-07-22T12:00:00-04:00",
      allDay: false,
    });
  });

  it("vacío devuelve null", () => {
    expect(isoFromEventDate(null)).toBeNull();
    expect(isoFromEventDate({})).toBeNull();
  });
});

describe("agendaItemDayKey — agrupa all-day por ymd sin new Date()", () => {
  it("all-day ymd puro se agrupa por el string tal cual", () => {
    expect(agendaItemDayKey({ start: "2026-07-22", allDay: true })).toBe("2026-07-22");
  });

  it("timed se agrupa por día Chile", () => {
    // 02:00 UTC del 23 = 22:00 Chile del 22 (invierno, -04)
    expect(
      agendaItemDayKey({ start: "2026-07-23T02:00:00.000Z", allDay: false }),
    ).toBe("2026-07-22");
  });

  it("all-day legacy con ISO completo cae al agrupado por Chile", () => {
    expect(
      agendaItemDayKey({ start: "2026-07-22T12:00:00.000Z", allDay: true }),
    ).toBe("2026-07-22");
  });
});

describe("buildVisitaEventPayload — timeZone explícita (audit 1.6)", () => {
  it("start y end declaran America/Santiago", () => {
    const payload = buildVisitaEventPayload(
      {
        startAt: new Date("2026-07-22T13:00:00.000Z"),
        endAt: new Date("2026-07-22T14:00:00.000Z"),
      },
      {
        typeLabel: "Cliente",
        accountName: "Codelco",
        opaiUrl: "https://opai.example/agenda",
        inviteContacts: false,
      },
    );
    expect(payload.start.timeZone).toBe("America/Santiago");
    expect(payload.end.timeZone).toBe("America/Santiago");
    expect(payload.start.dateTime).toBe("2026-07-22T13:00:00.000Z");
    expect(payload.start.date).toBeNull();
    expect(payload.end.date).toBeNull();
  });

  it("detecta hitos all-day Chile por duración", () => {
    expect(
      isAgendaVisitaAllDay(
        new Date("2026-08-17T04:00:00.000Z"),
        new Date("2026-08-18T03:59:00.000Z"),
      ),
    ).toBe(true);
    expect(
      isAgendaVisitaAllDay(
        new Date("2026-08-07T04:00:00.000Z"),
        new Date("2026-08-07T05:00:00.000Z"),
      ),
    ).toBe(false);
  });

  it("usa el título OPAI y all-day con end exclusivo", () => {
    // 17-ago 00:00 → 17-ago 23:59 Chile (UTC-4 en invierno)
    const payload = buildVisitaEventPayload(
      {
        title: "Cierre de consultas",
        startAt: new Date("2026-08-17T04:00:00.000Z"),
        endAt: new Date("2026-08-18T03:59:00.000Z"),
      },
      {
        typeLabel: "Visita",
        accountName: "Coexpan",
        opaiUrl: "https://opai.example/agenda",
        inviteContacts: false,
        allDay: true,
      },
    );
    expect(payload.summary).toBe("Cierre de consultas");
    expect(payload.start).toEqual({
      date: "2026-08-17",
      dateTime: null,
      timeZone: null,
    });
    expect(payload.end).toEqual({
      date: "2026-08-18",
      dateTime: null,
      timeZone: null,
    });
    expect(payload.start.dateTime).toBeNull();
  });
});
