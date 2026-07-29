import { describe, expect, it } from "vitest";
import { resolveWorkTab } from "../work-panel-tabs";

describe("resolveWorkTab (v4 aliases)", () => {
  it("mapea legacy a contexto", () => {
    expect(resolveWorkTab("contexto")).toBe("contexto");
    expect(resolveWorkTab("resumen")).toBe("contexto");
    expect(resolveWorkTab("cuenta")).toBe("contexto");
    expect(resolveWorkTab("vinculos")).toBe("contexto");
  });

  it("mapea legacy a trabajo", () => {
    expect(resolveWorkTab("trabajo")).toBe("trabajo");
    expect(resolveWorkTab("productividad")).toBe("trabajo");
    expect(resolveWorkTab("reunion")).toBe("trabajo");
  });
});
