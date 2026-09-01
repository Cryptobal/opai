import { describe, it, expect } from "vitest";
import {
  isInDestructionWindow,
  isEligibleForPersonalDataDestruction,
} from "@/lib/marcacion-retencion";

describe("ventana destrucción 57.4", () => {
  it("incluye 95 días y excluye 80 y 130", () => {
    const now = new Date("2026-09-01T00:00:00.000Z");
    const d95 = new Date(now.getTime() - 95 * 24 * 60 * 60 * 1000);
    const d80 = new Date(now.getTime() - 80 * 24 * 60 * 60 * 1000);
    const d130 = new Date(now.getTime() - 130 * 24 * 60 * 60 * 1000);
    expect(isInDestructionWindow(d95, now)).toBe(true);
    expect(isInDestructionWindow(d80, now)).toBe(false);
    expect(isInDestructionWindow(d130, now)).toBe(false);
  });

  it("el cron limpia desde 90 días (incluye atrasados > 120)", () => {
    const now = new Date("2026-09-01T00:00:00.000Z");
    const d95 = new Date(now.getTime() - 95 * 24 * 60 * 60 * 1000);
    const d130 = new Date(now.getTime() - 130 * 24 * 60 * 60 * 1000);
    const d80 = new Date(now.getTime() - 80 * 24 * 60 * 60 * 1000);
    expect(isEligibleForPersonalDataDestruction(d95, now)).toBe(true);
    expect(isEligibleForPersonalDataDestruction(d130, now)).toBe(true);
    expect(isEligibleForPersonalDataDestruction(d80, now)).toBe(false);
    expect(isEligibleForPersonalDataDestruction(null, now)).toBe(false);
  });
});
