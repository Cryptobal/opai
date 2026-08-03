import { describe, expect, it } from "vitest";
import { fmtCell } from "../format";
import { cornerKind, primaryCellTag } from "../cell-meta";
import type { FlowMatrixCellDto } from "@/modules/finance/flow-v3/matrix-types";

function cell(partial: Partial<FlowMatrixCellDto>): FlowMatrixCellDto {
  return {
    weekStart: "2026-08-03",
    plan: 0,
    committed: null,
    real: null,
    effective: 0,
    layer: "empty",
    ...partial,
  };
}

describe("fmtCell modes", () => {
  it("clp formatea con separadores es-CL", () => {
    expect(fmtCell(1_234_567)).toBe("1.234.567");
    expect(fmtCell(-500)).toBe("-500");
    expect(fmtCell(0)).toBe("");
  });
  it("m y mm redondean a miles/millones", () => {
    expect(fmtCell(1_234_567, "m")).toBe("1.235");
    expect(fmtCell(1_600_000, "mm")).toBe("2");
    expect(fmtCell(400, "m")).toBe("");
  });
});

describe("cornerKind / primaryCellTag", () => {
  it("real → esquina verde", () => {
    expect(cornerKind(cell({ layer: "real", effective: 100 }))).toBe("real");
    expect(primaryCellTag(cell({ layer: "real" }))?.tag).toBe("REAL");
  });
  it("programada sin marca; dte con marca azul", () => {
    const scheduled = cell({
      layer: "committed",
      committed: {
        total: 100,
        items: [{ kind: "scheduled", label: "Cuota", fecha: "2026-08-05", monto: 100 }],
      },
      effective: 100,
    });
    expect(cornerKind(scheduled)).toBeNull();
    expect(primaryCellTag(scheduled)?.tag).toBe("P");

    const dte = cell({
      layer: "committed",
      committed: {
        total: 100,
        items: [{ kind: "dte", folio: 1234, label: "Cli", fecha: "2026-08-05", monto: 100 }],
      },
      effective: 100,
    });
    expect(cornerKind(dte)).toBe("dte");
    expect(primaryCellTag(dte)?.tag).toBe("F°1234");
  });
});
