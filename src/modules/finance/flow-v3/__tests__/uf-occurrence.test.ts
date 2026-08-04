import { describe, it, expect } from "vitest";
import { ufTargetDate, ufToClp, projectUfWithGrowth } from "../uf-occurrence";

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

describe("projectUfWithGrowth", () => {
  const lastUf = 39_000;
  const lastYmd = "2026-01-31";

  it("growth 0 → idéntico a lastUfValue", () => {
    expect(projectUfWithGrowth(lastUf, lastYmd, "2026-06-15", 0)).toBe(lastUf);
  });

  it("target pasado o igual → lastUfValue", () => {
    expect(projectUfWithGrowth(lastUf, lastYmd, "2026-01-31", 0.3)).toBe(lastUf);
    expect(projectUfWithGrowth(lastUf, lastYmd, "2026-01-15", 0.3)).toBe(lastUf);
  });

  it("aplica crecimiento compuesto mensual (0.3%)", () => {
    const target = "2026-04-15"; // 3 meses calendario desde ene
    const months = 3;
    const expected = lastUf * Math.pow(1 + 0.3 / 100, months);
    expect(projectUfWithGrowth(lastUf, lastYmd, target, 0.3)).toBeCloseTo(expected, 6);
  });
});
