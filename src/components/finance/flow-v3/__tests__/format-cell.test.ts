import { describe, expect, it } from "vitest";
import { fmtCell } from "../format";
import { cornerKind, pastPendingDteMeta, primaryCellTag } from "../cell-meta";
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
  it("programada sin marca; dte con marca azul; plan manual con marca primary", () => {
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

    const multi = cell({
      layer: "committed",
      committed: {
        total: 200,
        items: [
          { kind: "dte", folio: 1, label: "A", fecha: "2026-08-01", monto: 100 },
          { kind: "dte", folio: 2, label: "B", fecha: "2026-08-02", monto: 100 },
        ],
      },
      effective: 200,
    });
    expect(primaryCellTag(multi)?.tag).toBe("×2");
    expect(primaryCellTag(multi)?.title).toContain("F°1");

    const plan = cell({ layer: "plan", plan: 70_000_000, effective: -70_000_000 });
    expect(cornerKind(plan)).toBe("plan");
    expect(primaryCellTag(plan)?.tag).toBe("Plan");
  });

  it("semana pasada con F° pendiente → chip informativo; sin isPast no aparece", () => {
    const past = cell({
      layer: "empty",
      effective: 0,
      committed: {
        total: 200_000,
        items: [
          { kind: "dte", folio: 1582, label: "SCRB", fecha: "2026-03-10", monto: 200_000 },
        ],
      },
    });
    expect(primaryCellTag(past)).toBeNull();
    expect(primaryCellTag(past, { isPast: true })?.tag).toBe("F°1582");
    expect(pastPendingDteMeta(past, true)?.total).toBe(200_000);
    expect(pastPendingDteMeta(past, false)).toBeNull();
  });
});
