import { describe, it, expect } from "vitest";
import { computeRecurringIssueYmd } from "../dte-recurring-schedule";
import { formatDateOnlyUtcYmd, parseYmdToDbDate } from "@/lib/fx-date";

/**
 * Heurística de reparación (sin BD): solo re-fecha si date == bugYmd exacto.
 */
describe("repair heuristic — exact bug match", () => {
  const tpl = {
    facturaTiming: "DIA_ESPECIFICO" as const,
    facturaDay: 1,
    facturaMesRelativo: "MES_SIGUIENTE",
    dayOfMonth: 20,
  };

  it("match exacto: occurrence 20-jul → bug 01-ago → reparar a 20-jul/hoy", () => {
    const occurrenceYmd = "2026-07-20";
    const bugYmd = computeRecurringIssueYmd(tpl, parseYmdToDbDate(occurrenceYmd));
    expect(bugYmd).toBe("2026-08-01");
    const draftDate = "2026-08-01";
    expect(draftDate === bugYmd).toBe(true);
    // Target = max(occurrence, today) lo decide el service; acá solo el match.
    expect(formatDateOnlyUtcYmd(parseYmdToDbDate(occurrenceYmd))).toBe("2026-07-20");
  });

  it("edición manual: date ≠ bugYmd → no tocar", () => {
    const occurrenceYmd = "2026-07-20";
    const bugYmd = computeRecurringIssueYmd(tpl, parseYmdToDbDate(occurrenceYmd));
    const manualDate = "2026-08-22"; // como F°1771 tras posible edición
    expect(manualDate === bugYmd).toBe(false);
  });
});
