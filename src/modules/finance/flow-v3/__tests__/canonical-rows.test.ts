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

  it("incluye IVA postergado inmediatamente después de IVA F29", () => {
    const ivaIdx = CANONICAL_FLOW_ROWS.findIndex((r) => r.canonicalKey === "IVA_F29");
    expect(CANONICAL_FLOW_ROWS[ivaIdx + 1]).toEqual({
      section: "IMPUESTOS",
      name: "IVA postergado",
      categoryCode: null,
      canonicalKey: "IVA_POSTERGADO",
    });
  });

  it("abre sueldos/quincena/previred en Guardias vs Equipo interno", () => {
    const children = CANONICAL_FLOW_ROWS.filter((r) => r.parentCanonicalKey);
    expect(children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ canonicalKey: "SUELDO_OPERATIVO", parentCanonicalKey: "SUELDO", name: "Guardias" }),
        expect.objectContaining({ canonicalKey: "SUELDO_ADMIN", parentCanonicalKey: "SUELDO", name: "Equipo interno" }),
        expect.objectContaining({ canonicalKey: "QUINCENA_OPERATIVO", parentCanonicalKey: "QUINCENA" }),
        expect.objectContaining({ canonicalKey: "QUINCENA_ADMIN", parentCanonicalKey: "QUINCENA" }),
        expect.objectContaining({ canonicalKey: "PREVIRED_OPERATIVO", parentCanonicalKey: "PREVIRED" }),
        expect.objectContaining({ canonicalKey: "PREVIRED_ADMIN", parentCanonicalKey: "PREVIRED" }),
      ]),
    );
    expect(children).toHaveLength(6);
  });

  it("incluye fila Finiquitos en REMUNERACIONES con EGR_FINIQUITO + FINIQUITO", () => {
    expect(CANONICAL_FLOW_ROWS).toContainEqual({
      section: "REMUNERACIONES",
      name: "Finiquitos",
      categoryCode: "EGR_FINIQUITO",
      canonicalKey: "FINIQUITO",
    });
  });

  it("incluye Costo factoring en FINANCIAMIENTO con EGR_FACTORING + FACTORING", () => {
    expect(CANONICAL_FLOW_ROWS).toContainEqual({
      section: "FINANCIAMIENTO",
      name: "Costo factoring",
      categoryCode: "EGR_FACTORING",
      canonicalKey: "FACTORING",
    });
  });

  it("Aporte / Retiro / Devolución a socios nacen con categoría y llave", () => {
    expect(CANONICAL_FLOW_ROWS).toContainEqual({
      section: "FINANCIAMIENTO",
      name: "Aporte socios",
      categoryCode: "ING_PRESTAMO_SOCIO",
      canonicalKey: "APORTE_SOCIO",
    });
    expect(CANONICAL_FLOW_ROWS).toContainEqual({
      section: "FINANCIAMIENTO",
      name: "Retiro socios",
      categoryCode: "EGR_RETIRO_SOCIO",
      canonicalKey: "RETIRO_SOCIO",
    });
    expect(CANONICAL_FLOW_ROWS).toContainEqual({
      section: "FINANCIAMIENTO",
      name: "Devolución a socios",
      categoryCode: "EGR_DEVOL_PRESTAMO_SOCIO",
      canonicalKey: "DEVOL_PRESTAMO_SOCIO",
    });
  });

  it("bandejas tienen canonicalKey propia", () => {
    expect(CANONICAL_FLOW_ROWS.find((r) => r.name === "Otros ingresos")?.canonicalKey).toBe(
      "BANDEJA_INGRESO",
    );
    expect(CANONICAL_FLOW_ROWS.find((r) => r.name === "Otros egresos")?.canonicalKey).toBe(
      "BANDEJA_EGRESO",
    );
  });
});
