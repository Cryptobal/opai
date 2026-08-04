import { describe, it, expect } from "vitest";
import { compareFlowRows } from "../row-sort";

describe("compareFlowRows — orden alfabético de presentación", () => {
  it("ordena A→Z dentro de la misma sección (es, base, numeric)", () => {
    const rows = [
      { section: "INGRESOS", name: "Berlintexx" },
      { section: "INGRESOS", name: "Ametel Spa" },
      { section: "INGRESOS", name: "Ámbar" },
      { section: "INGRESOS", name: "3M Chile" },
    ];
    const sorted = [...rows].sort(compareFlowRows).map((r) => r.name);
    expect(sorted).toEqual(["3M Chile", "Ámbar", "Ametel Spa", "Berlintexx"]);
  });

  it("ignora mayúsculas y acentos al comparar", () => {
    expect(compareFlowRows(
      { section: "GAV", name: "Ángel" },
      { section: "GAV", name: "angel" },
    )).toBe(0);
  });

  it("deja filas virtuales al final de su sección", () => {
    const rows = [
      { section: "INGRESOS", name: "Otros ingresos", isVirtual: true },
      { section: "INGRESOS", name: "Zurich" },
      { section: "INGRESOS", name: "Ametel Spa" },
    ];
    const sorted = [...rows].sort(compareFlowRows).map((r) => r.name);
    expect(sorted).toEqual(["Ametel Spa", "Zurich", "Otros ingresos"]);
  });

  it("respeta el orden de secciones", () => {
    const rows = [
      { section: "GAV", name: "Agua" },
      { section: "INGRESOS", name: "Cliente Z" },
      { section: "REMUNERACIONES", name: "Sueldos" },
    ];
    const sorted = [...rows].sort(compareFlowRows).map((r) => r.section);
    expect(sorted).toEqual(["INGRESOS", "REMUNERACIONES", "GAV"]);
  });
});
