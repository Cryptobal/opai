import { describe, it, expect } from "vitest";
import { computeLieScore } from "../scoring/detectors";

describe("computeLieScore — asimétrico", () => {
  it("valor 5 pesa el doble que valor 4 con default weights", () => {
    const all5 = computeLieScore([
      { value: 5, extremeValues: [4, 5], weights: { 4: 0.5, 5: 1.0 } },
      { value: 5, extremeValues: [4, 5], weights: { 4: 0.5, 5: 1.0 } },
    ]);
    const all4 = computeLieScore([
      { value: 4, extremeValues: [4, 5], weights: { 4: 0.5, 5: 1.0 } },
      { value: 4, extremeValues: [4, 5], weights: { 4: 0.5, 5: 1.0 } },
    ]);
    expect(all5).toBe(1.0);
    expect(all4).toBe(0.5);
  });

  it("sin weights fallback a binario (cada hit cuenta 1)", () => {
    const score = computeLieScore([
      { value: 5, extremeValues: [4, 5] },
      { value: 4, extremeValues: [4, 5] },
      { value: 3, extremeValues: [4, 5] },
    ]);
    expect(score).toBeCloseTo(2 / 3, 3);
  });

  it("valores fuera de extremos no aportan (binario y ponderado)", () => {
    const binary = computeLieScore([
      { value: 1, extremeValues: [4, 5] },
      { value: 2, extremeValues: [4, 5] },
      { value: 3, extremeValues: [4, 5] },
    ]);
    const weighted = computeLieScore([
      { value: 1, extremeValues: [4, 5], weights: { 4: 0.5, 5: 1.0 } },
      { value: 2, extremeValues: [4, 5], weights: { 4: 0.5, 5: 1.0 } },
      { value: 3, extremeValues: [4, 5], weights: { 4: 0.5, 5: 1.0 } },
    ]);
    expect(binary).toBe(0);
    expect(weighted).toBe(0);
  });
});
