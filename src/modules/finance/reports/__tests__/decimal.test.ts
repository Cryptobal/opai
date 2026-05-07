import { describe, it, expect } from "vitest";
import { decimalToNumber, safePct, deltaPct } from "../shared/decimal";

describe("decimal helpers", () => {
  it("decimalToNumber handles null/undefined as 0", () => {
    expect(decimalToNumber(null)).toBe(0);
    expect(decimalToNumber(undefined)).toBe(0);
  });

  it("decimalToNumber returns plain numbers as-is", () => {
    expect(decimalToNumber(42)).toBe(42);
  });

  it("decimalToNumber unwraps Decimal-like objects", () => {
    const d = { toNumber: () => 100 } as unknown as Parameters<typeof decimalToNumber>[0];
    expect(decimalToNumber(d)).toBe(100);
  });

  it("safePct rounds to 1 decimal", () => {
    expect(safePct(50, 200)).toBe(25);
    expect(safePct(1, 3)).toBe(33.3);
  });

  it("safePct returns 0 when denom is 0", () => {
    expect(safePct(10, 0)).toBe(0);
  });

  it("deltaPct: from 100 to 150 → +50%", () => {
    expect(deltaPct(150, 100)).toBe(50);
  });

  it("deltaPct: from 0 to non-zero → 100", () => {
    expect(deltaPct(50, 0)).toBe(100);
    expect(deltaPct(0, 0)).toBe(0);
  });

  it("deltaPct handles negative previous", () => {
    expect(deltaPct(50, -50)).toBe(200); // (50 - (-50)) / 50 = 200%
  });
});
