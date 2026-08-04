import { describe, it, expect } from "vitest";
import {
  assignPendingCaption,
  countAssignPendingInCell,
  countAssignPendingInWindow,
  isFallbackBandejaRow,
} from "../unmatched-count";
import type { FlowMatrixRowDto } from "../matrix-assemble";

function row(partial: Partial<FlowMatrixRowDto> & { name: string }): FlowMatrixRowDto {
  return {
    id: "r1",
    section: "INGRESOS",
    mapping: "MANUAL",
    orderIndex: 0,
    crmAccountId: null,
    installationId: null,
    categoryId: null,
    supplierId: null,
    isArchived: false,
    archivedWeekCutoff: null,
    isVirtual: false,
    cells: [],
    ...partial,
  };
}

describe("unmatched-count", () => {
  it("detecta filas bandeja", () => {
    expect(isFallbackBandejaRow({ name: "Otros ingresos", isVirtual: true })).toBe(true);
    expect(isFallbackBandejaRow({ name: "Ametel" })).toBe(false);
  });

  it("cuenta DTEs por celda", () => {
    expect(
      countAssignPendingInCell({
        committed: {
          items: [
            { kind: "dte" },
            { kind: "dte" },
            { kind: "scheduled" },
          ],
        },
      }),
    ).toBe(2);
  });

  it("suma ventana y caption", () => {
    const rows = [
      row({
        name: "Otros ingresos",
        isVirtual: true,
        cells: [
          {
            weekStart: "2026-08-03",
            plan: 0,
            committed: {
              total: 100,
              items: [
                { kind: "dte", label: "A", fecha: "2026-08-01", monto: 50 },
                { kind: "dte", label: "B", fecha: "2026-08-02", monto: 50 },
              ],
            },
            real: null,
            effective: 100,
            layer: "committed",
          },
          {
            weekStart: "2026-08-10",
            plan: 0,
            committed: {
              total: 30,
              items: [{ kind: "dte", label: "C", fecha: "2026-08-10", monto: 30 }],
            },
            real: null,
            effective: 30,
            layer: "committed",
          },
        ],
      }),
    ];
    expect(countAssignPendingInWindow(rows, "INGRESOS")).toBe(3);
    expect(assignPendingCaption(3)).toBe("3 por asignar");
    expect(assignPendingCaption(1)).toBe("1 por asignar");
    expect(assignPendingCaption(0)).toBeNull();
  });
});
