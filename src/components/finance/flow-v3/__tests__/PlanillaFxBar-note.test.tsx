/**
 * Chip de nota en la barra fx: más ancho y hasta 2 líneas.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { FlowMatrixCellDto, FlowMatrixRowDto } from "@/modules/finance/flow-v3/matrix-types";
import { PlanillaFxBar } from "../PlanillaFxBar";

const LONG_NOTE =
  "Prestamo CIG a socios por liquidacion de agosto con detalle adicional que debe caber en dos lineas del chip";

function cellWithNote(): FlowMatrixCellDto {
  return {
    weekStart: "2026-08-03",
    plan: 0,
    committed: null,
    real: {
      items: [{
        bankTransactionId: "bt-1",
        label: "Transf",
        fecha: "2026-08-03",
        monto: -4_200_000,
      }],
      total: -4_200_000,
    },
    effective: -4_200_000,
    layer: "real",
    note: LONG_NOTE,
  };
}

function row(): FlowMatrixRowDto {
  return {
    id: "row-1",
    name: "Devolución a socios",
    section: "FINANCIAMIENTO",
    mapping: "manual",
    orderIndex: 0,
    crmAccountId: null,
    installationId: null,
    categoryId: null,
    supplierId: null,
    isArchived: false,
    archivedWeekCutoff: null,
    isVirtual: false,
    cells: [cellWithNote()],
  };
}

describe("PlanillaFxBar — chip de nota", () => {
  it("muestra la nota completa en el chip (sin truncar a 140px)", () => {
    const c = cellWithNote();
    render(
      <PlanillaFxBar
        selection={{
          rowNumber: 57,
          rowName: "Devolución a socios",
          colIdx: 3,
          weekStart: "2026-08-03",
          row: row(),
          cell: c,
        }}
        onOpenLayers={() => {}}
      />,
    );
    const chip = screen.getByText(/Nota:/);
    expect(chip.textContent).toContain(LONG_NOTE);
    expect(chip.className).toMatch(/line-clamp-2/);
    expect(chip.className).not.toMatch(/\btruncate\b/);
    expect(chip.getAttribute("title")).toBe(LONG_NOTE);
  });
});
