import { describe, expect, it } from "vitest";
import { hexToHslComponents, withLightness } from "../hex-to-hsl";

describe("hexToHslComponents", () => {
  it("convierte navy #142033 a HSL", () => {
    const hsl = hexToHslComponents("#142033");
    expect(hsl).toMatch(/^21[7-9]\s+\d+%\s+\d+%$/);
  });

  it("acepta #RGB corto", () => {
    expect(hexToHslComponents("#0a8")).toBeTruthy();
  });

  it("rechaza inválidos", () => {
    expect(hexToHslComponents("nope")).toBeNull();
    expect(hexToHslComponents("")).toBeNull();
  });
});

describe("withLightness", () => {
  it("reemplaza L", () => {
    expect(withLightness("218 36% 12%", 20)).toBe("218 36% 20%");
  });
});
