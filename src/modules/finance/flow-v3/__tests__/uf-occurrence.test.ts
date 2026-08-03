import { describe, it, expect } from "vitest";
import { ufTargetDate, ufToClp } from "../uf-occurrence";

describe("ufTargetDate", () => {
  const d = new Date(Date.UTC(2026, 1, 15)); // 15 feb 2026

  it("RUN_DAY = fecha de ocurrencia", () => {
    expect(ufTargetDate("RUN_DAY", null, d).toISOString().slice(0, 10)).toBe("2026-02-15");
  });

  it("LAST_DAY_MONTH clampa a fin de mes", () => {
    expect(ufTargetDate("LAST_DAY_MONTH", null, d).toISOString().slice(0, 10)).toBe("2026-02-28");
  });

  it("LAST_DAY_PREV_MONTH", () => {
    expect(ufTargetDate("LAST_DAY_PREV_MONTH", null, d).toISOString().slice(0, 10)).toBe("2026-01-31");
  });

  it("CUSTOM_DAY 31 en febrero → 28", () => {
    expect(ufTargetDate("CUSTOM_DAY", 31, d).toISOString().slice(0, 10)).toBe("2026-02-28");
  });
});

describe("ufToClp", () => {
  it("redondea a entero", () => {
    expect(ufToClp(24.5, 39_000.4)).toBe(Math.round(24.5 * 39_000.4));
  });
});
