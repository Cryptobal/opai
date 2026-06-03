import { describe, it, expect } from "vitest";
import { bucketKeyFor } from "../recurrence-engine";

/**
 * Réplica mínima de la regla post-consolidate (mismo bucket, no ±20d).
 */
function shouldKeepProjection(
  projDate: Date,
  dteDates: Date[],
  granularity: "weekly" | "monthly" = "weekly",
): boolean {
  const pBucket = bucketKeyFor(projDate, granularity);
  const dteBuckets = new Set(
    dteDates.map((d) => bucketKeyFor(d, granularity)),
  );
  return !dteBuckets.has(pBucket);
}

describe("consolidateIncome — mismo bucket semanal", () => {
  it("mantiene PROGRAMADA día 20 si el DTE del mes está en otra semana (ej. borrador 1 jun)", () => {
    const proj = new Date(Date.UTC(2026, 5, 20));
    const dteEarly = new Date(Date.UTC(2026, 5, 1));
    expect(shouldKeepProjection(proj, [dteEarly])).toBe(true);
    expect(bucketKeyFor(proj, "weekly")).not.toBe(bucketKeyFor(dteEarly, "weekly"));
  });

  it("oculta PROGRAMADA si ya hay DTE en la misma semana ISO", () => {
    const proj = new Date(Date.UTC(2026, 5, 20));
    const dteSameWeek = new Date(Date.UTC(2026, 5, 18));
    expect(shouldKeepProjection(proj, [dteSameWeek])).toBe(false);
    expect(bucketKeyFor(proj, "weekly")).toBe(bucketKeyFor(dteSameWeek, "weekly"));
  });

  it("±20 días en mes distinto: antes se ocultaba mal; con bucket no", () => {
    const proj = new Date(Date.UTC(2026, 5, 20));
    const dte = new Date(Date.UTC(2026, 5, 2));
    const diffDays = Math.abs(dte.getTime() - proj.getTime()) / 86_400_000;
    expect(diffDays).toBeLessThanOrEqual(20);
    expect(shouldKeepProjection(proj, [dte])).toBe(true);
  });
});
