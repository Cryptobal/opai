import { describe, it, expect } from "vitest";
import { isBusinessDay, nextBusinessDay } from "@/lib/business-days";
import { isMarcacionBackOfficeWindowOpen } from "@/lib/marcacion-business-day-rule";

describe("isBusinessDay / nextBusinessDay", () => {
  it("sábado y domingo no son hábiles", () => {
    expect(isBusinessDay(new Date(2026, 2, 7))).toBe(false); // sáb 7 mar 2026
    expect(isBusinessDay(new Date(2026, 2, 8))).toBe(false); // dom
    expect(isBusinessDay(new Date(2026, 2, 9))).toBe(true); // lun
  });

  it("respeta feriados YYYY-MM-DD", () => {
    const holidays = new Set(["2026-03-09"]);
    expect(isBusinessDay(new Date(2026, 2, 9), holidays)).toBe(false);
    const next = nextBusinessDay(new Date(2026, 2, 6), holidays); // vie → salta feriado lun
    expect(next.getDate()).toBe(10);
  });

  it("nextBusinessDay de viernes es lunes", () => {
    const next = nextBusinessDay(new Date(2026, 2, 6)); // vie 6 mar
    expect(next.getDay()).toBe(1);
    expect(next.getDate()).toBe(9);
  });
});

describe("Art. 41 c window", () => {
  it("rechaza modificación el mismo día hábil de la marca", () => {
    const mark = new Date("2026-03-10T15:00:00.000Z"); // mar 10 mar Chile
    const now = new Date("2026-03-10T20:00:00.000Z");
    expect(isMarcacionBackOfficeWindowOpen(mark, now)).toBe(false);
  });

  it("acepta desde el día hábil siguiente", () => {
    const mark = new Date("2026-03-10T15:00:00.000Z");
    const now = new Date("2026-03-11T12:00:00.000Z");
    expect(isMarcacionBackOfficeWindowOpen(mark, now)).toBe(true);
  });

  it("marca del viernes recién el lunes", () => {
    const mark = new Date("2026-03-06T15:00:00.000Z"); // vie
    const saturday = new Date("2026-03-07T15:00:00.000Z");
    const monday = new Date("2026-03-09T15:00:00.000Z");
    expect(isMarcacionBackOfficeWindowOpen(mark, saturday)).toBe(false);
    expect(isMarcacionBackOfficeWindowOpen(mark, monday)).toBe(true);
  });
});
