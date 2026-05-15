import { describe, expect, it } from "vitest";
import { formatCalendarDateDisplay } from "../fx-date";

describe("formatCalendarDateDisplay", () => {
  it("usa el día calendario UTC para medianoche ISO (Postgres DATE)", () => {
    const pgMidnightUtc = new Date("2026-05-14T00:00:00.000Z");
    expect(formatCalendarDateDisplay(pgMidnightUtc, "dd/MM/yyyy")).toBe(
      "14/05/2026",
    );
  });
});
