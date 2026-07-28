import { describe, expect, it } from "vitest";
import { preferredRolName } from "../coverage-slots-to-quote-positions";

describe("preferredRolName", () => {
  it("mapea 24/7 y continuo a 4x4", () => {
    expect(preferredRolName("24/7")).toBe("4x4");
    expect(preferredRolName("24x7")).toBe("4x4");
    expect(preferredRolName("Continuo 24h")).toBe("4x4");
  });

  it("respeta 4x4 y 7x7 explícitos", () => {
    expect(preferredRolName("4x4")).toBe("4x4");
    expect(preferredRolName("7x7")).toBe("7x7");
    expect(preferredRolName("7/7")).toBe("7x7");
  });

  it("mapea 5x2", () => {
    expect(preferredRolName("5x2")).toBe("5x2");
  });

  it("null / vacío → null", () => {
    expect(preferredRolName(null)).toBeNull();
    expect(preferredRolName(undefined)).toBeNull();
    expect(preferredRolName("")).toBeNull();
  });
});
