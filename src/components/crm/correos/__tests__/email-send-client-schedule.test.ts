import { describe, expect, it } from "vitest";
import { toZonedTime } from "date-fns-tz";
import { CHILE_TZ, ymdInChile } from "@/lib/dates-cl";
import {
  formatScheduleWhen,
  scheduleAtChileWallTime,
  scheduleSendPresets,
} from "../email-send-client";

describe("scheduleSendPresets", () => {
  it("devuelve mañana mañana/tarde y próximo lunes en Chile", () => {
    // Miércoles 29 jul 2026 12:00 Chile (UTC-4 en invierno → 16:00 UTC).
    const now = new Date("2026-07-29T16:00:00.000Z");
    const presets = scheduleSendPresets(now);
    expect(presets.map((p) => p.key)).toEqual([
      "tomorrow-morning",
      "tomorrow-afternoon",
      "monday-morning",
    ]);
    expect(presets[0].label).toBe("Mañana por la mañana");
    expect(presets[1].label).toBe("Mañana por la tarde");
    expect(presets[2].label).toBe("El lunes por la mañana");

    expect(ymdInChile(presets[0].date)).toBe("2026-07-30");
    expect(ymdInChile(presets[1].date)).toBe("2026-07-30");
    expect(ymdInChile(presets[2].date)).toBe("2026-08-03");

    const h0 = toZonedTime(presets[0].date, CHILE_TZ);
    const h1 = toZonedTime(presets[1].date, CHILE_TZ);
    const h2 = toZonedTime(presets[2].date, CHILE_TZ);
    expect(h0.getHours()).toBe(8);
    expect(h1.getHours()).toBe(13);
    expect(h2.getHours()).toBe(8);
  });

  it("si hoy es lunes, el preset apunta al próximo lunes (no hoy)", () => {
    // Lunes 27 jul 2026 10:00 Chile.
    const now = new Date("2026-07-27T14:00:00.000Z");
    const monday = scheduleSendPresets(now).find((p) => p.key === "monday-morning");
    expect(monday).toBeTruthy();
    expect(ymdInChile(monday!.date)).toBe("2026-08-03");
  });
});

describe("scheduleAtChileWallTime / formatScheduleWhen", () => {
  it("ancla la hora de pared a America/Santiago", () => {
    const d = scheduleAtChileWallTime("2026-07-30", 8, 0);
    const local = toZonedTime(d, CHILE_TZ);
    expect(local.getFullYear()).toBe(2026);
    expect(local.getMonth()).toBe(6);
    expect(local.getDate()).toBe(30);
    expect(local.getHours()).toBe(8);
    expect(local.getMinutes()).toBe(0);
  });

  it("formatea etiqueta corta sin año", () => {
    const d = scheduleAtChileWallTime("2026-07-30", 8, 0);
    const label = formatScheduleWhen(d);
    expect(label).toMatch(/30/);
    expect(label).toMatch(/jul/i);
    expect(label).toMatch(/8:00/);
    expect(label).not.toMatch(/2026/);
  });
});
