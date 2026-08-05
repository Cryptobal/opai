import { describe, it, expect } from "vitest";
import {
  CANONICAL_FLOW_ROWS,
  RETIRED_CANONICAL_ROW_NAMES,
  resolveSectionMove,
  SECTION_MOVES,
} from "../canonical-rows";

describe("SECTION_MOVES", () => {
  it("incluye Devolución préstamo socios INGRESOS → FINANCIAMIENTO (migración)", () => {
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

  it("ya no es canónica: Devolución préstamo socios está retirada", () => {
    expect(CANONICAL_FLOW_ROWS.some((r) => r.name === "Devolución préstamo socios")).toBe(false);
    expect(RETIRED_CANONICAL_ROW_NAMES).toContain("Devolución préstamo socios");
  });

  it("incluye fila Finiquitos en REMUNERACIONES", () => {
    expect(CANONICAL_FLOW_ROWS).toContainEqual({
      section: "REMUNERACIONES",
      name: "Finiquitos",
      categoryCode: null,
    });
  });

  it("incluye Costo factoring en FINANCIAMIENTO", () => {
    expect(CANONICAL_FLOW_ROWS).toContainEqual({
      section: "FINANCIAMIENTO",
      name: "Costo factoring",
      categoryCode: null,
    });
  });
});
