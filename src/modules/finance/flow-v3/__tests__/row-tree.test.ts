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
