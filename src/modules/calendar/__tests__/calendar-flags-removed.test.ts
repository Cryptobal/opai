import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

describe("Calendar v2 incondicional", () => {
  it("no existe calendar-flags.ts ni isCalendarV2Enabled", () => {
    expect(existsSync(join(process.cwd(), "src/modules/calendar/calendar-flags.ts"))).toBe(
      false,
    );
  });

  it("no queda syncVisitaTecnicaToCalendar en agenda-sync", () => {
    const src = readFileSync(
      join(process.cwd(), "src/modules/agenda/agenda-sync.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/syncVisitaTecnicaToCalendar/);
    expect(src).not.toMatch(/isCalendarV2Enabled/);
  });
});
