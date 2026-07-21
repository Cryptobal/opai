import { describe, expect, it } from "vitest";
import { isNewLeadCandidate } from "../radar-items";

describe("isNewLeadCandidate", () => {
  it("rechaza hilos ya vinculados a lead o deal", () => {
    expect(
      isNewLeadCandidate({ intencion: "alta", categoria: "cotizacion" }, "lead-1", null),
    ).toBe(false);
    expect(
      isNewLeadCandidate({ intencion: "alta", categoria: "cotizacion" }, null, "deal-1"),
    ).toBe(false);
  });

  it("acepta intención alta de cualquier categoría", () => {
    expect(isNewLeadCandidate({ intencion: "alta", categoria: "otro" }, null, null)).toBe(true);
  });

  it("acepta media en cotización / licitación / consulta comercial", () => {
    expect(
      isNewLeadCandidate({ intencion: "media", categoria: "cotizacion" }, null, null),
    ).toBe(true);
    expect(
      isNewLeadCandidate({ intencion: "media", categoria: "licitacion" }, null, null),
    ).toBe(true);
    expect(
      isNewLeadCandidate({ intencion: "media", categoria: "consulta_comercial" }, null, null),
    ).toBe(true);
  });

  it("rechaza media en categorías no comerciales y baja", () => {
    expect(
      isNewLeadCandidate({ intencion: "media", categoria: "facturacion" }, null, null),
    ).toBe(false);
    expect(
      isNewLeadCandidate({ intencion: "baja", categoria: "cotizacion" }, null, null),
    ).toBe(false);
  });
});
