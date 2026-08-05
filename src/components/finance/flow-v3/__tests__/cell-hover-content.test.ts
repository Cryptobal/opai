import { describe, expect, it } from "vitest";
import type { FlowMatrixCellDto, FlowMatrixRowDto } from "@/modules/finance/flow-v3/matrix-types";
import { buildHoverCardContent } from "../cell-hover-content";

function baseRow(partial: Partial<FlowMatrixRowDto> = {}): FlowMatrixRowDto {
  return {
    id: "row-1",
    name: "IVA Postergado",
    section: "IMPUESTOS",
    mapping: "MANUAL",
    orderIndex: 1,
    crmAccountId: null,
    installationId: null,
    categoryId: null,
    supplierId: null,
    isVirtual: false,
    isArchived: false,
    archivedWeekCutoff: null,
    cells: [],
    ...partial,
  };
}

function cell(partial: Partial<FlowMatrixCellDto>): FlowMatrixCellDto {
  return {
    weekStart: "2026-08-24",
    plan: 0,
    committed: null,
    real: null,
    effective: 0,
    layer: "empty",
    note: null,
    ...partial,
  };
}

describe("buildHoverCardContent", () => {
  it("plan manual con proyección", () => {
    const model = buildHoverCardContent({
      row: baseRow(),
      cell: cell({
        layer: "plan",
        plan: 27_080_000,
        committed: { total: 19_998_251, items: [] },
        effective: 27_080_000,
      }),
      colIdx: 34,
      rowNumber: 35,
    });
    expect(model.badges).toContain("Plan");
    expect(model.badges).toContain("manual");
    expect(model.lines[0]?.label).toBe("Plan");
    expect(model.lines.some((l) => l.label === "Proyección")).toBe(true);
    expect(model.ref).toBe("AJ35");
  });

  it("comprometido trunca a 3 ítems con +N más", () => {
    const items = Array.from({ length: 5 }, (_, i) => ({
      kind: "dte" as const,
      dteId: `d${i}`,
      folio: 1000 + i,
      label: `Cliente ${i}`,
      monto: 100_000 * (i + 1),
      fecha: "2026-08-20",
      emissionYmd: "2026-08-20",
      dueYmd: "2026-09-20",
    }));
    const model = buildHoverCardContent({
      row: baseRow(),
      cell: cell({
        layer: "committed",
        committed: { total: 1_500_000, items },
        effective: 1_500_000,
      }),
      colIdx: 0,
      rowNumber: 1,
    });
    expect(model.items).toHaveLength(3);
    expect(model.itemsMore).toBe(2);
    expect(model.lines[0]?.emphasize).toBe(true);
  });

  it("comprometido con 1 ítem no muestra +N", () => {
    const model = buildHoverCardContent({
      row: baseRow(),
      cell: cell({
        layer: "committed",
        committed: {
          total: 200_000,
          items: [{
            kind: "dte",
            dteId: "d1",
            folio: 42,
            label: "Acme",
            monto: 200_000,
            fecha: "2026-08-20",
            emissionYmd: "2026-08-20",
          }],
        },
        effective: 200_000,
      }),
      colIdx: 0,
      rowNumber: 2,
    });
    expect(model.items).toHaveLength(1);
    expect(model.itemsMore).toBe(0);
  });

  it("real con drift", () => {
    const model = buildHoverCardContent({
      row: baseRow({ section: "INGRESOS", name: "Cobros" }),
      cell: cell({
        layer: "real",
        real: {
          total: 900_000,
          items: [{
            bankTransactionId: "bt1",
            label: "Pago",
            monto: 900_000,
            fecha: "2026-08-25",
            folio: 7,
          }],
        },
        projected: 1_000_000,
        drift: { delta: -100_000, pct: -10 },
        effective: 900_000,
      }),
      colIdx: 1,
      rowNumber: 3,
    });
    expect(model.drift).not.toBeNull();
    expect(model.drift?.positive).toBe(false);
    expect(model.lines[0]?.label).toBe("Real");
  });

  it("pendiente pasado", () => {
    const model = buildHoverCardContent({
      row: baseRow({ section: "INGRESOS" }),
      cell: cell({
        layer: "empty",
        committed: {
          total: 50_000,
          items: [{
            kind: "dte",
            dteId: "d9",
            folio: 99,
            label: "Pendiente SA",
            monto: 50_000,
            fecha: "2026-07-01",
          }],
        },
      }),
      colIdx: 0,
      rowNumber: 4,
      isPast: true,
    });
    expect(model.pastPending).toContain("Pendiente");
  });

  it("celda vacía: solo nota en modelo", () => {
    const model = buildHoverCardContent({
      row: baseRow(),
      cell: cell({ layer: "empty", note: "Julio 2026" }),
      colIdx: 0,
      rowNumber: 5,
    });
    expect(model.lines).toHaveLength(0);
    expect(model.items).toHaveLength(0);
    expect(model.note).toBe("Julio 2026");
  });

  it("reason en pie cuando no editable", () => {
    const model = buildHoverCardContent({
      row: baseRow(),
      cell: cell({ layer: "plan", plan: 1000, effective: 1000 }),
      colIdx: 0,
      reason: "Semana cerrada",
    });
    expect(model.footerHint).toBe("Semana cerrada");
  });
});
