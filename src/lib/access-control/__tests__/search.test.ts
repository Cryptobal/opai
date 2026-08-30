import { describe, expect, it } from "vitest";
import {
  buildAccessRecordSearchOr,
  looksLikeRutQuery,
} from "@/lib/access-control/utils";

describe("looksLikeRutQuery", () => {
  it("acepta RUT con puntos y guión", () => {
    expect(looksLikeRutQuery("14.170.061-8")).toBe(true);
  });

  it("acepta RUT limpio persistido en BD", () => {
    expect(looksLikeRutQuery("141700618")).toBe(true);
  });

  it("rechaza un nombre", () => {
    expect(looksLikeRutQuery("Roberto Zuñiga")).toBe(false);
  });
});

describe("buildAccessRecordSearchOr", () => {
  it("agrega el RUT limpio cuando el guardia busca con formato de cédula", () => {
    const or = buildAccessRecordSearchOr("14.170.061-8");
    expect(or).toEqual(
      expect.arrayContaining([
        { rut: { contains: "14.170.061-8" } },
        { rut: { contains: "141700618" } },
        { fullName: { contains: "14.170.061-8", mode: "insensitive" } },
      ]),
    );
  });

  it("acepta RUT con solo guion (caso portal cliente)", () => {
    const or = buildAccessRecordSearchOr("9368146-0", { includeCompany: true });
    expect(or).toEqual(
      expect.arrayContaining([
        { rut: { contains: "9368146-0" } },
        { rut: { contains: "93681460" } },
        { company: { contains: "9368146-0", mode: "insensitive" } },
      ]),
    );
  });

  it("no duplica el RUT si ya viene limpio", () => {
    const or = buildAccessRecordSearchOr("141700618");
    const rutClauses = or.filter((c) => c.rut);
    expect(rutClauses).toHaveLength(1);
    expect(rutClauses[0]).toEqual({ rut: { contains: "141700618" } });
  });

  it("busca por nombre sin cláusulas de RUT extra", () => {
    const or = buildAccessRecordSearchOr("Roberto");
    expect(or.some((c) => c.fullName?.contains === "Roberto")).toBe(true);
    expect(or.filter((c) => c.rut)).toHaveLength(1);
    expect(or.find((c) => c.rut)?.rut?.contains).toBe("Roberto");
  });
});
