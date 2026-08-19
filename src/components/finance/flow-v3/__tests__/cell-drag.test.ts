import { describe, expect, it } from "vitest";
import type { FlowMatrixCellDto } from "@/modules/finance/flow-v3/matrix-types";
import {
  cellLevelDragPayload,
  itemDragPayload,
  stackedCommittedLines,
} from "../cell-drag";

function cell(partial: Partial<FlowMatrixCellDto>): FlowMatrixCellDto {
  return {
    weekStart: "2026-08-17",
    plan: 0,
    committed: null,
    real: null,
    effective: 0,
    layer: "empty",
    ...partial,
  };
}

const dte = {
  kind: "dte" as const,
  dteId: "dte-1767",
  folio: 1767,
  label: "CIMS",
  fecha: "2026-07-21",
  monto: 5_006_345,
};

const scheduled = {
  kind: "scheduled" as const,
  templateId: "tpl-cims",
  billingPeriod: "2026-08",
  label: "CIMS - La Reina",
  fecha: "2026-08-20",
  monto: 5_007_960,
};

describe("cell-drag", () => {
  it("P sola: la celda entera se arrastra como programación", () => {
    const c = cell({
      layer: "committed",
      committed: { total: scheduled.monto, items: [scheduled] },
      effective: scheduled.monto,
    });
    expect(cellLevelDragPayload(c)).toEqual({
      kind: "scheduled",
      templateId: "tpl-cims",
      billingPeriod: "2026-08",
    });
    expect(stackedCommittedLines(c)).toEqual([]);
  });

  it("F° sola: la celda entera se arrastra como factura", () => {
    const c = cell({
      layer: "committed",
      committed: { total: dte.monto, items: [dte] },
      effective: dte.monto,
    });
    expect(cellLevelDragPayload(c)).toEqual({ kind: "dte", dteId: "dte-1767" });
  });

  it("CIMS F° + P: dos líneas, cada una con su drag; la celda no se arrastra entera", () => {
    const c = cell({
      layer: "committed",
      committed: { total: dte.monto + scheduled.monto, items: [dte, scheduled] },
      effective: dte.monto + scheduled.monto,
    });
    expect(cellLevelDragPayload(c)).toBeNull();
    const lines = stackedCommittedLines(c);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      tag: "F°1767",
      monto: 5_006_345,
      drag: { kind: "dte", dteId: "dte-1767" },
    });
    expect(lines[1]).toMatchObject({
      tag: "P",
      monto: 5_007_960,
      drag: { kind: "scheduled", templateId: "tpl-cims", billingPeriod: "2026-08" },
    });
  });

  it("P sin billingPeriod no se puede arrastrar", () => {
    expect(
      itemDragPayload({
        kind: "scheduled",
        templateId: "tpl",
        label: "Huérfana",
        fecha: "2026-08-17",
        monto: 1,
      }),
    ).toBeNull();
  });
});
