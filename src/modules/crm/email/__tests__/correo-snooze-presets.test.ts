import { describe, expect, it } from "vitest";
import { fromZonedTime } from "date-fns-tz";
import { CHILE_TZ } from "@/lib/dates-cl";
import {
  buildCorreoSnoozePresets,
  chileDateTimeToUtc,
  DEFAULT_CORREO_SNOOZE_CONFIG,
  parseCorreoSnoozeConfig,
} from "../correo-snooze-presets";

/** Instante UTC correspondiente a una pared Chile. */
function chileInstant(
  y: number,
  mo: number,
  d: number,
  h: number,
  mi = 0,
): Date {
  return fromZonedTime(new Date(y, mo - 1, d, h, mi, 0, 0), CHILE_TZ);
}

describe("parseCorreoSnoozeConfig", () => {
  it("devuelve defaults ante input inválido", () => {
    expect(parseCorreoSnoozeConfig(null)).toEqual(DEFAULT_CORREO_SNOOZE_CONFIG);
    expect(parseCorreoSnoozeConfig([])).toEqual(DEFAULT_CORREO_SNOOZE_CONFIG);
    expect(parseCorreoSnoozeConfig("x")).toEqual(DEFAULT_CORREO_SNOOZE_CONFIG);
  });

  it("acepta horas y días válidos", () => {
    expect(
      parseCorreoSnoozeConfig({
        morningHour: 7,
        afternoonHour: 15,
        weekendDay: 0,
        nextWeekDay: 2,
      }),
    ).toEqual({
      morningHour: 7,
      afternoonHour: 15,
      weekendDay: 0,
      nextWeekDay: 2,
    });
  });

  it("corrige valores fuera de rango", () => {
    expect(
      parseCorreoSnoozeConfig({
        morningHour: 99,
        afternoonHour: -1,
        weekendDay: 3,
        nextWeekDay: 9,
      }),
    ).toEqual(DEFAULT_CORREO_SNOOZE_CONFIG);
  });
});

describe("buildCorreoSnoozePresets", () => {
  it("incluye +1h, +3h, mañana y próxima semana un martes a mediodía", () => {
    // Martes 28-jul-2026 12:00 Chile
    const now = chileInstant(2026, 7, 28, 12, 0);
    const presets = buildCorreoSnoozePresets(now);
    const ids = presets.map((p) => p.id);
    expect(ids).toContain("plus_1h");
    expect(ids).toContain("plus_3h");
    expect(ids).toContain("later_today");
    expect(ids).toContain("tomorrow");
    expect(ids).toContain("later_this_week");
    expect(ids).toContain("this_weekend");
    expect(ids).toContain("next_week");

    const later = presets.find((p) => p.id === "later_today")!;
    expect(later.at).toEqual(chileInstant(2026, 7, 28, 18, 0));

    const tomorrow = presets.find((p) => p.id === "tomorrow")!;
    expect(tomorrow.at).toEqual(chileInstant(2026, 7, 29, 8, 0));

    const nextWeek = presets.find((p) => p.id === "next_week")!;
    expect(nextWeek.at).toEqual(chileInstant(2026, 8, 3, 8, 0));
  });

  it("omite Hoy más tarde si la hora ya pasó", () => {
    const now = chileInstant(2026, 7, 28, 19, 0);
    const ids = buildCorreoSnoozePresets(now).map((p) => p.id);
    expect(ids).not.toContain("later_today");
    expect(ids).toContain("plus_1h");
  });

  it("respeta morningHour y afternoonHour configurables", () => {
    const now = chileInstant(2026, 7, 28, 10, 0);
    const presets = buildCorreoSnoozePresets(now, {
      morningHour: 9,
      afternoonHour: 15,
      weekendDay: 6,
      nextWeekDay: 1,
    });
    expect(presets.find((p) => p.id === "later_today")!.at).toEqual(
      chileInstant(2026, 7, 28, 15, 0),
    );
    expect(presets.find((p) => p.id === "tomorrow")!.at).toEqual(
      chileInstant(2026, 7, 29, 9, 0),
    );
  });

  it("omite esta semana más tarde el viernes", () => {
    const now = chileInstant(2026, 7, 31, 10, 0); // viernes
    const ids = buildCorreoSnoozePresets(now).map((p) => p.id);
    expect(ids).not.toContain("later_this_week");
  });
});

describe("chileDateTimeToUtc", () => {
  it("interpreta pared Chile", () => {
    const at = chileDateTimeToUtc("2026-07-29", "08:00");
    expect(at).toEqual(chileInstant(2026, 7, 29, 8, 0));
  });

  it("rechaza formatos inválidos", () => {
    expect(chileDateTimeToUtc("29/07/2026", "08:00")).toBeNull();
    expect(chileDateTimeToUtc("2026-07-29", "25:00")).toBeNull();
  });
});
