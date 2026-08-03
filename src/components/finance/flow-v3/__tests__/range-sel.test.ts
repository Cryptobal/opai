import { describe, it, expect } from "vitest";
import {
  cellKey, cellRangeClass, cellsInRect, discreteStats, rangeRect, rangeToTsv,
  toggleDiscreteCell, type RangeSel,
} from "../range-sel";

const rows = ["a", "b", "c", "d"];

describe("rangeRect / cellsInRect", () => {
  it("normaliza ancla e head en cualquier orden", () => {
    const range: RangeSel = {
      anchor: { rowId: "c", colIdx: 3 },
      head: { rowId: "a", colIdx: 1 },
    };
    expect(rangeRect(range, rows)).toEqual({ r0: 0, r1: 2, c0: 1, c1: 3 });
  });

  it("lista celdas fila×columna", () => {
    const rect = { r0: 1, r1: 2, c0: 0, c1: 1 };
    expect(cellsInRect(rect, rows)).toEqual([
      { rowId: "b", colIdx: 0 },
      { rowId: "b", colIdx: 1 },
      { rowId: "c", colIdx: 0 },
      { rowId: "c", colIdx: 1 },
    ]);
  });
});

describe("cellRangeClass", () => {
  it("celda única usa planilla-selected en head", () => {
    const rect = { r0: 0, r1: 0, c0: 2, c1: 2 };
    expect(cellRangeClass(0, 2, rect, { rowId: "a", colIdx: 2 }, "a")).toBe("planilla-selected");
  });

  it("multi-celda marca perímetro y head", () => {
    const rect = { r0: 0, r1: 1, c0: 0, c1: 1 };
    expect(cellRangeClass(0, 0, rect, { rowId: "b", colIdx: 1 }, "a")).toContain("planilla-range-t");
    expect(cellRangeClass(0, 0, rect, { rowId: "b", colIdx: 1 }, "a")).toContain("planilla-range-l");
    expect(cellRangeClass(1, 1, rect, { rowId: "b", colIdx: 1 }, "b")).toContain("planilla-range-head");
  });
});

describe("rangeToTsv", () => {
  it("1×1 es valor simple sin tabs", () => {
    expect(rangeToTsv([[1234]])).toBe("1234");
  });

  it("serializa grilla con tabs y saltos", () => {
    expect(rangeToTsv([[1, -2], [3, 4]])).toBe("1\t-2\n3\t4");
  });
});

describe("discreteStats / toggleDiscreteCell", () => {
  it("promedia solo celdas ≠ 0", () => {
    expect(discreteStats([100, 0, 200])).toEqual({
      sum: 300, avg: 150, count: 3, nonzeroCount: 2,
    });
  });

  it("toggle agrega y quita por cellKey", () => {
    let m = new Map<string, number>();
    m = toggleDiscreteCell(m, cellKey("a", 0), 10);
    expect(m.get("a:0")).toBe(10);
    m = toggleDiscreteCell(m, cellKey("a", 0), 10);
    expect(m.has("a:0")).toBe(false);
  });
});
