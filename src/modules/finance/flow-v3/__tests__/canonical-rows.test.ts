import { describe, it, expect } from "vitest";
import { CANONICAL_FLOW_ROWS, resolveSectionMove, SECTION_MOVES } from "../canonical-rows";

describe("SECTION_MOVES", () => {
  it("incluye Devolución préstamo socios INGRESOS → FINANCIAMIENTO", () => {
    expect(SECTION_MOVES).toContainEqual({
      name: "Devolución préstamo socios",
      fromSection: "INGRESOS",
      toSection: "FINANCIAMIENTO",
    });
  });

  it("resolveSectionMove es idempotente tras el movimiento", () => {
    const target = resolveSectionMove("Devolución préstamo socios", "INGRESOS");
    expect(target).toBe("FINANCIAMIENTO");
    expect(resolveSectionMove("Devolución préstamo socios", "FINANCIAMIENTO")).toBeNull();
    expect(resolveSectionMove("Otros ingresos", "INGRESOS")).toBeNull();
  });

  it("canónicas no duplican Devolución préstamo socios en INGRESOS", () => {
    const ingresos = CANONICAL_FLOW_ROWS.filter((r) => r.section === "INGRESOS");
    expect(ingresos.some((r) => r.name === "Devolución préstamo socios")).toBe(false);
    const fin = CANONICAL_FLOW_ROWS.filter((r) => r.section === "FINANCIAMIENTO");
    expect(fin.some((r) => r.name === "Devolución préstamo socios")).toBe(true);
  });

  it("incluye fila Finiquitos en REMUNERACIONES", () => {
    expect(CANONICAL_FLOW_ROWS).toContainEqual({
      section: "REMUNERACIONES",
      name: "Finiquitos",
      categoryCode: null,
    });
  });
});
