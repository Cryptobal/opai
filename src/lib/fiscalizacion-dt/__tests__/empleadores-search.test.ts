import { describe, expect, it } from "vitest";
import { matchesEmployerQuery } from "../empleadores";

describe("búsqueda de empleador Art. 24 a", () => {
  const item = {
    legalName: "Gard Security SpA",
    name: "Gard",
    rut: "76.123.456-7",
  };

  it("busca por razón social", () => {
    expect(matchesEmployerQuery(item, "gard security")).toBe(true);
  });

  it("busca RUT con y sin puntos, con guión", () => {
    expect(matchesEmployerQuery(item, "76.123.456-7")).toBe(true);
    expect(matchesEmployerQuery(item, "76123456-7")).toBe(true);
    expect(matchesEmployerQuery(item, "761234567")).toBe(true);
  });

  it("no coincide con otro RUT", () => {
    expect(matchesEmployerQuery(item, "11.111.111-1")).toBe(false);
  });
});
