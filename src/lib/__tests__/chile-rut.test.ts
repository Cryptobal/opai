import { describe, expect, it } from "vitest";
import { rutSearchNeedles, toSiiRut } from "@/lib/chile-rut";

describe("rutSearchNeedles", () => {
  it("incluye formato SII para RUT con puntos", () => {
    const needles = rutSearchNeedles("11.111.111-1");
    expect(needles).toContain("11.111.111-1");
    expect(needles).toContain("11111111-1");
    expect(needles).toContain("111111111");
    expect(toSiiRut("11.111.111-1")).toBe("11111111-1");
  });

  it("no inventa variantes SII para texto que no es RUT", () => {
    expect(rutSearchNeedles("Proveedor SA")).toEqual(["Proveedor SA"]);
    expect(rutSearchNeedles("5144")).toEqual(["5144"]);
  });

  it("trim vacío → []", () => {
    expect(rutSearchNeedles("  ")).toEqual([]);
  });
});
