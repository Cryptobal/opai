import { describe, expect, it } from "vitest";
import { fmtCell, fmtClpShort } from "../format";
import {
  cornerKind,
  pastPendingDteMeta,
  pastPendingGhostMeta,
  primaryCellTag,
} from "../cell-meta";
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

describe("fmtClpShort", () => {
  it("millones con 1 decimal y miles con k", () => {
    expect(fmtClpShort(41_900_000)).toBe("$41,9M");
    expect(fmtClpShort(820_000)).toBe("$820k");
    expect(fmtClpShort(0)).toBe("$0");
    expect(fmtClpShort(-1_500_000)).toBe("-$1,5M");
  });
});

describe("cornerKind / primaryCellTag", () => {
  it("real → esquina verde; chip folio si hay DTE conciliado", () => {
    expect(cornerKind(cell({ layer: "real", effective: 100 }))).toBe("real");
    expect(primaryCellTag(cell({ layer: "real" }))?.tag).toBe("REAL");
    expect(
      primaryCellTag(
        cell({
          layer: "real",
          real: {
            total: 100,
            items: [{
              bankTransactionId: "bt1",
              folio: 1777,
              dteId: "d1",
              label: "Santa Hilda",
              fecha: "2026-08-10",
              monto: 100,
            }],
          },
          effective: 100,
        }),
      )?.tag,
    ).toBe("F°1777");
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

    const mixed = cell({
      layer: "committed",
      committed: {
        total: 10_014_305,
        items: [
          { kind: "dte", folio: 1767, label: "CIMS", fecha: "2026-07-21", monto: 5_006_345 },
          {
            kind: "scheduled",
            templateId: "tpl",
            billingPeriod: "2026-08",
            label: "CIMS - La Reina",
            fecha: "2026-08-20",
            monto: 5_007_960,
          },
        ],
      },
      effective: 10_014_305,
    });
    expect(primaryCellTag(mixed)?.tag).toBe("F°1767 · P");
    expect(primaryCellTag(mixed)?.title).toContain("programación");
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

  it("semana pasada con sueldos/programado o plan → fantasma atenuado (no desaparece)", () => {
    const sueldos = cell({
      layer: "empty",
      effective: 0,
      committed: {
        total: 537_838,
        items: [
          {
            kind: "scheduled",
            label: "Sueldos líquidos",
            fecha: "2026-08-03",
            monto: 537_838,
          },
        ],
      },
    });
    expect(pastPendingGhostMeta(sueldos, true)).toMatchObject({
      total: 537_838,
      tag: "P",
      kind: "committed",
    });
    expect(primaryCellTag(sueldos, { isPast: true })?.tag).toBe("P");
    expect(pastPendingGhostMeta(sueldos, false)).toBeNull();

    const plan = cell({ layer: "empty", effective: 0, plan: 1_352_000 });
    expect(pastPendingGhostMeta(plan, true)).toMatchObject({
      total: 1_352_000,
      tag: "Plan",
      kind: "plan",
    });
  });
});
