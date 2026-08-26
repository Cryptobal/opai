import { describe, it, expect } from "vitest";
import {
  applySubrowVisibility,
  canHaveSubRows,
  nestFlowRows,
  rollupCollapsedCells,
} from "../row-tree";
import type { FlowMatrixCellDto } from "../matrix-assemble";
import { displayValue } from "@/components/finance/flow-v3/grid-classes";

function cell(over: Partial<FlowMatrixCellDto> = {}): FlowMatrixCellDto {
  return {
    weekStart: "2026-08-17",
    plan: 0,
    committed: null,
    real: null,
    effective: 0,
    layer: "empty",
    ...over,
  };
}

describe("canHaveSubRows", () => {
  it("permite GAV raíz sin llave de sistema", () => {
    expect(canHaveSubRows({ id: "a", name: "Asesores", section: "GAV" })).toBe(true);
  });
  it("rechaza bandeja, hijo y segundo nivel", () => {
    expect(canHaveSubRows({ id: "b", name: "Otros", section: "GAV", canonicalKey: "BANDEJA_EGRESO" })).toBe(false);
    expect(canHaveSubRows({ id: "c", name: "Contador", section: "GAV", parentId: "a" })).toBe(false);
    expect(canHaveSubRows({ id: "d", name: "Sueldo", section: "REMUNERACIONES" })).toBe(false);
  });
  it("permite Impuestos raíz sin llave de sistema (T.G.R.)", () => {
    expect(canHaveSubRows({ id: "tgr", name: "T.G.R.", section: "IMPUESTOS" })).toBe(true);
  });
  it("rechaza IVA F29 canónico", () => {
    expect(canHaveSubRows({
      id: "iva", name: "IVA F29", section: "IMPUESTOS", canonicalKey: "IVA_F29",
    })).toBe(false);
  });
});

describe("nestFlowRows", () => {
  it("coloca hijos justo debajo del padre y cuenta childCount", () => {
    const nested = nestFlowRows([
      { id: "p", name: "Asesores", parentId: null },
      { id: "c2", name: "Prevencionista", parentId: "p" },
      { id: "c1", name: "Contador", parentId: "p" },
      { id: "solo", name: "Arriendo", parentId: null },
    ]);
    expect(nested.map((r) => r.id)).toEqual(["p", "c1", "c2", "solo"]);
    expect(nested[0]!.childCount).toBe(2);
    expect(nested[1]!.childCount).toBe(0);
  });

  it("ordena hijos por orderIndex y después por nombre", () => {
    const nested = nestFlowRows([
      { id: "p", name: "Sueldos", parentId: null, orderIndex: 1 },
      { id: "admin", name: "Equipo interno", parentId: "p", orderIndex: 3 },
      { id: "op", name: "Guardias", parentId: "p", orderIndex: 2 },
    ]);
    expect(nested.map((r) => r.id)).toEqual(["p", "op", "admin"]);
  });
});

describe("rollupCollapsedCells + subtotales sin doble conteo", () => {
  it("la suma contraída = padre + hijos; el subtotal usa filas persistidas", () => {
    const parentCells = [cell({ plan: 100_000, effective: -100_000, layer: "plan" })];
    const childA = [cell({ plan: 400_000, effective: -400_000, layer: "plan" })];
    const childB = [cell({ plan: 200_000, effective: -200_000, layer: "plan" })];
    const rolled = rollupCollapsedCells(
      { section: "GAV", cells: parentCells },
      [{ cells: childA }, { cells: childB }],
    );
    expect(rolled[0]!.plan).toBe(700_000);
    expect(rolled[0]!.effective).toBe(-700_000);

    const persisted = [
      { section: "GAV", cells: parentCells },
      { section: "GAV", cells: childA },
      { section: "GAV", cells: childB },
    ];
    const subtotal = persisted.reduce(
      (s, r) => s + displayValue(r.section, r.cells[0]!.layer, r.cells[0]!.effective),
      0,
    );
    expect(subtotal).toBe(700_000);
    expect(subtotal).toBe(displayValue("GAV", rolled[0]!.layer, rolled[0]!.effective));
  });
});

describe("rollupCollapsedCells — padres de remuneraciones", () => {
  it("SUELDO contraído ignora plan del padre y solo suma hijos", () => {
    const parentCells = [cell({ plan: 80_000_000, effective: -80_000_000, layer: "plan" })];
    const childOp = [cell({
      plan: 0,
      effective: -90_751_268,
      layer: "committed",
      committed: { total: 90_751_268, items: [] },
    })];
    const childAd = [cell({ plan: 0, effective: 0, layer: "empty" })];
    const rolled = rollupCollapsedCells(
      { section: "REMUNERACIONES", canonicalKey: "SUELDO", cells: parentCells },
      [{ cells: childOp }, { cells: childAd }],
    );
    expect(rolled[0]!.plan).toBe(0);
    expect(rolled[0]!.effective).toBe(-90_751_268);
    expect(rolled[0]!.committed?.total).toBe(90_751_268);
    expect(displayValue("REMUNERACIONES", rolled[0]!.layer, rolled[0]!.effective)).toBe(90_751_268);
  });
});

describe("applySubrowVisibility", () => {
  const parent = {
    id: "p",
    name: "Asesores",
    parentId: null as string | null,
    section: "GAV",
    cells: [cell()],
  };
  const child = {
    id: "c",
    name: "Contador",
    parentId: "p",
    section: "GAV",
    cells: [cell({ plan: 10, effective: -10, layer: "plan" as const })],
  };

  it("contraído oculta hijos y marca rolledUp", () => {
    const out = applySubrowVisibility({
      all: [parent, child],
      filtered: [parent, child],
      expandedIds: new Set(),
      searchActive: false,
    });
    expect(out.rows.map((r) => r.id)).toEqual(["p"]);
    expect(out.rolledUpIds.has("p")).toBe(true);
    expect(out.rows[0]!.cells[0]!.plan).toBe(10);
    expect(out.rows[0]!.childCount).toBe(1);
  });

  it("childCount usa all aunque los hijos no estén en filtered", () => {
    const out = applySubrowVisibility({
      all: [parent, child],
      filtered: [parent],
      expandedIds: new Set(),
      searchActive: false,
    });
    expect(out.rows[0]!.childCount).toBe(1);
    expect(out.rows.map((r) => r.id)).toEqual(["p"]);
  });

  it("expandido muestra el detalle", () => {
    const out = applySubrowVisibility({
      all: [parent, child],
      filtered: [parent, child],
      expandedIds: new Set(["p"]),
      searchActive: false,
    });
    expect(out.rows.map((r) => r.id)).toEqual(["p", "c"]);
    expect(out.rolledUpIds.size).toBe(0);
  });
});
