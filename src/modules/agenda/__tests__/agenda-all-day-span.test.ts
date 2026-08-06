import { describe, expect, it } from "vitest";
import { fromZonedTime } from "date-fns-tz";
import { CHILE_TZ } from "@/lib/dates-cl";
import {
  allDaySpanFromBounds,
  allDaySpanFromGoogleDates,
} from "../agenda-all-day-span";

function chileLocal(y: number, m: number, d: number, h = 0, min = 0): Date {
  return fromZonedTime(new Date(y, m - 1, d, h, min, 0, 0), CHILE_TZ);
}

describe("allDaySpanFromBounds", () => {
  it("multi-día inclusivo → spanStart/End", () => {
    const span = allDaySpanFromBounds({
      id: "ev-1",
      startAt: chileLocal(2026, 8, 10, 0, 0),
      endAt: chileLocal(2026, 8, 15, 23, 59),
      allDay: true,
    });
    expect(span).toEqual({
      spanKey: "ev-1",
      spanStartYmd: "2026-08-10",
      spanEndYmd: "2026-08-15",
    });
  });

  it("un solo día → null (sin banda)", () => {
    expect(
      allDaySpanFromBounds({
        id: "ev-2",
        startAt: chileLocal(2026, 8, 10, 0, 0),
        endAt: chileLocal(2026, 8, 10, 23, 59),
        allDay: true,
      }),
    ).toBeNull();
  });

  it("timed → null", () => {
    expect(
      allDaySpanFromBounds({
        id: "ev-3",
        startAt: chileLocal(2026, 8, 10, 9, 0),
        endAt: chileLocal(2026, 8, 10, 10, 0),
        allDay: false,
      }),
    ).toBeNull();
  });
});

describe("allDaySpanFromGoogleDates", () => {
  it("end exclusivo Google → último día inclusivo", () => {
    expect(
      allDaySpanFromGoogleDates({
        id: "g:1",
        startYmd: "2026-08-10",
        endExclusiveYmd: "2026-08-16",
      }),
    ).toEqual({
      spanKey: "g:1",
      spanStartYmd: "2026-08-10",
      spanEndYmd: "2026-08-15",
    });
  });

  it("un día (end = start+1) → null", () => {
    expect(
      allDaySpanFromGoogleDates({
        id: "g:2",
        startYmd: "2026-08-10",
        endExclusiveYmd: "2026-08-11",
      }),
    ).toBeNull();
  });
});
