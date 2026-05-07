import { describe, it, expect } from "vitest";
import {
  buildPeriod,
  previousPeriod,
  splitMonths,
  toISO,
  parseISODate,
} from "../shared/period.helper";

describe("period.helper", () => {
  it("builds a month period correctly", () => {
    const p = buildPeriod("month", new Date(2026, 4, 7));
    expect(p.type).toBe("month");
    expect(p.from).toBe("2026-05-01");
    expect(p.to).toBe("2026-05-31");
    expect(p.label).toContain("Mayo");
  });

  it("builds a quarter period correctly", () => {
    const p = buildPeriod("quarter", new Date(2026, 6, 15));
    expect(p.type).toBe("quarter");
    expect(p.from).toBe("2026-07-01");
    expect(p.to).toBe("2026-09-30");
    expect(p.label).toBe("Q3 2026");
  });

  it("builds a YTD period correctly", () => {
    const p = buildPeriod("ytd", new Date(2026, 4, 12));
    expect(p.type).toBe("ytd");
    expect(p.from).toBe("2026-01-01");
    expect(p.to).toBe("2026-05-31");
  });

  it("previousPeriod of month returns prior month", () => {
    const p = buildPeriod("month", new Date(2026, 4, 7));
    const prev = previousPeriod(p);
    expect(prev.from).toBe("2026-04-01");
    expect(prev.to).toBe("2026-04-30");
  });

  it("splitMonths spans across multiple months", () => {
    const p = buildPeriod("quarter", new Date(2026, 6, 15));
    const months = splitMonths(p);
    expect(months).toHaveLength(3);
    expect(months[0].key).toBe("2026-07");
    expect(months[2].key).toBe("2026-09");
  });

  it("toISO ↔ parseISODate roundtrip", () => {
    const d = new Date(2026, 0, 1);
    expect(toISO(d)).toBe("2026-01-01");
    expect(toISO(parseISODate("2026-01-01"))).toBe("2026-01-01");
  });
});
