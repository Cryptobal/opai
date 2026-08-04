import { describe, it, expect } from "vitest";
import { compareFlowRows, presentationBlock, type SortableFlowRow } from "../row-sort";

function sortNames(rows: SortableFlowRow[]): string[] {
  return [...rows].sort(compareFlowRows).map((r) => r.name);
}

describe("compareFlowRows — bloques de presentación v4.8", () => {
  it("ordena A→Z dentro de la misma sección (es, base, numeric)", () => {
    const rows: SortableFlowRow[] = [
      { section: "INGRESOS", name: "Berlintexx", mapping: "ACCOUNT_INSTALLATION" },
      { section: "INGRESOS", name: "Ametel Spa", mapping: "ACCOUNT_INSTALLATION" },
      { section: "INGRESOS", name: "Ámbar", mapping: "ACCOUNT_INSTALLATION" },
      { section: "INGRESOS", name: "3M Chile", mapping: "ACCOUNT_INSTALLATION" },
    ];
    expect(sortNames(rows)).toEqual(["3M Chile", "Ámbar", "Ametel Spa", "Berlintexx"]);
  });

  it("ignora mayúsculas y acentos al comparar", () => {
    expect(
      compareFlowRows(
        { section: "GAV", name: "Ángel", mapping: "CATEGORY" },
        { section: "GAV", name: "angel", mapping: "CATEGORY" },
      ),
    ).toBe(0);
  });

  it("deja filas virtuales al final de su sección", () => {
    const rows: SortableFlowRow[] = [
      { section: "INGRESOS", name: "Otros ingresos", isVirtual: true, isBandeja: true, mapping: "MANUAL" },
      { section: "INGRESOS", name: "Zurich", mapping: "ACCOUNT_INSTALLATION" },
      { section: "INGRESOS", name: "Ametel Spa", mapping: "ACCOUNT_INSTALLATION" },
    ];
    expect(sortNames(rows)).toEqual(["Ametel Spa", "Zurich", "Otros ingresos"]);
  });

  it("respeta el orden de secciones", () => {
    const rows: SortableFlowRow[] = [
      { section: "GAV", name: "Agua", mapping: "CATEGORY" },
      { section: "INGRESOS", name: "Cliente Z", mapping: "ACCOUNT_INSTALLATION" },
      { section: "REMUNERACIONES", name: "Sueldos", mapping: "CATEGORY" },
    ];
    const sorted = [...rows].sort(compareFlowRows).map((r) => r.section);
    expect(sorted).toEqual(["INGRESOS", "REMUNERACIONES", "GAV"]);
  });

  it("no intercala manuales entre filas con cuenta/programación", () => {
    const rows: SortableFlowRow[] = [
      { section: "INGRESOS", name: "Santa Hilda", mapping: "ACCOUNT_INSTALLATION", id: "c3" },
      { section: "INGRESOS", name: "Préstamo socios", mapping: "MANUAL", id: "m1" },
      { section: "INGRESOS", name: "Polpaico", mapping: "ACCOUNT_INSTALLATION", id: "c2" },
      { section: "INGRESOS", name: "Aporte socios", mapping: "MANUAL", id: "m0" },
      { section: "INGRESOS", name: "Ametel Spa", mapping: "ACCOUNT_INSTALLATION", id: "c1" },
    ];
    expect(sortNames(rows)).toEqual([
      "Ametel Spa",
      "Polpaico",
      "Santa Hilda",
      "Aporte socios",
      "Préstamo socios",
    ]);
  });

  it("bandeja persistida cierra la sección (tras manuales)", () => {
    const rows: SortableFlowRow[] = [
      { section: "INGRESOS", name: "Otros ingresos", mapping: "MANUAL", isBandeja: true, id: "b" },
      { section: "INGRESOS", name: "Préstamo socios", mapping: "MANUAL", id: "m" },
      { section: "INGRESOS", name: "Zurich", mapping: "ACCOUNT_INSTALLATION", id: "c" },
    ];
    expect(sortNames(rows)).toEqual(["Zurich", "Préstamo socios", "Otros ingresos"]);
  });

  it("Otros egresos cierra GAV tras categorías y manuales", () => {
    const rows: SortableFlowRow[] = [
      { section: "GAV", name: "Otros egresos", mapping: "MANUAL", isBandeja: true, id: "b" },
      { section: "GAV", name: "Arriendo oficina", mapping: "CATEGORY", id: "c1" },
      { section: "GAV", name: "Ajuste manual", mapping: "MANUAL", id: "m1" },
      { section: "GAV", name: "Combustible", mapping: "CATEGORY", id: "c2" },
    ];
    expect(sortNames(rows)).toEqual([
      "Arriendo oficina",
      "Combustible",
      "Ajuste manual",
      "Otros egresos",
    ]);
  });

  it("virtual queda después de la bandeja persistida", () => {
    const rows: SortableFlowRow[] = [
      { section: "INGRESOS", name: "Otros ingresos", isVirtual: true, isBandeja: true, mapping: "MANUAL", id: "v" },
      { section: "INGRESOS", name: "Otros ingresos", mapping: "MANUAL", isBandeja: true, id: "b" },
      { section: "INGRESOS", name: "Cliente", mapping: "ACCOUNT_INSTALLATION", id: "c" },
    ];
    const sorted = [...rows].sort(compareFlowRows);
    expect(sorted.map((r) => r.id)).toEqual(["c", "b", "v"]);
  });

  it("desempata por id cuando el nombre empata", () => {
    const rows: SortableFlowRow[] = [
      { section: "INGRESOS", name: "Gemelo", mapping: "ACCOUNT_INSTALLATION", id: "b" },
      { section: "INGRESOS", name: "Gemelo", mapping: "ACCOUNT_INSTALLATION", id: "a" },
    ];
    expect([...rows].sort(compareFlowRows).map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("presentationBlock: cuenta=0, manual=1, bandeja=2, virtual=3", () => {
    expect(presentationBlock({ section: "INGRESOS", name: "X", mapping: "ACCOUNT_INSTALLATION" })).toBe(0);
    expect(presentationBlock({ section: "INGRESOS", name: "X", mapping: "CATEGORY" })).toBe(0);
    expect(presentationBlock({ section: "INGRESOS", name: "X", mapping: "SUPPLIER" })).toBe(0);
    expect(presentationBlock({ section: "INGRESOS", name: "X", mapping: "MANUAL" })).toBe(1);
    expect(presentationBlock({ section: "INGRESOS", name: "Otros ingresos", mapping: "MANUAL", isBandeja: true })).toBe(2);
    expect(presentationBlock({ section: "INGRESOS", name: "Otros ingresos", isVirtual: true, isBandeja: true })).toBe(3);
  });

  it("snapshot Gard: bloque clientes intacto, préstamo antes de bandeja", () => {
    const rows: SortableFlowRow[] = [
      { section: "INGRESOS", name: "Otros ingresos", mapping: "MANUAL", isBandeja: true, id: "oi" },
      { section: "INGRESOS", name: "Transmat 80%", mapping: "ACCOUNT_INSTALLATION", id: "t80" },
      { section: "INGRESOS", name: "Préstamo socios", mapping: "MANUAL", id: "ps" },
      { section: "INGRESOS", name: "Polpaico", mapping: "ACCOUNT_INSTALLATION", id: "po" },
      { section: "INGRESOS", name: "Santa Hilda", mapping: "ACCOUNT_INSTALLATION", id: "sh" },
      { section: "INGRESOS", name: "Ametel Spa", mapping: "ACCOUNT_INSTALLATION", id: "am" },
      { section: "INGRESOS", name: "Transmat 20%", mapping: "ACCOUNT_INSTALLATION", id: "t20" },
      { section: "INGRESOS", name: "Devolución préstamo socios", mapping: "MANUAL", id: "dps" },
      { section: "GAV", name: "Otros egresos", mapping: "MANUAL", isBandeja: true, id: "oe" },
      { section: "GAV", name: "Arriendo", mapping: "CATEGORY", id: "ar" },
      { section: "REMUNERACIONES", name: "Sueldos líquidos", mapping: "CATEGORY", id: "su" },
    ];
    expect(sortNames(rows)).toEqual([
      "Ametel Spa",
      "Polpaico",
      "Santa Hilda",
      "Transmat 20%",
      "Transmat 80%",
      "Devolución préstamo socios",
      "Préstamo socios",
      "Otros ingresos",
      "Sueldos líquidos",
      "Arriendo",
      "Otros egresos",
    ]);
  });
});
