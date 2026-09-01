import { describe, it, expect, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { FlowMatrixCellDto, MatrixColumn } from "@/modules/finance/flow-v3/matrix-types";
import { CellCompositionPanel } from "../CellCompositionPanel";

const WEEKS: MatrixColumn[] = [
  {
    key: "2026-08-24", label: "S35", monthKey: "2026-08",
    weekStart: "2026-08-24", isCurrent: false, isPast: true, weekCount: 1,
  },
  {
    key: "2026-08-31", label: "S36", monthKey: "2026-08",
    weekStart: "2026-08-31", isCurrent: false, isPast: false, weekCount: 1,
  },
  {
    key: "2026-09-07", label: "S37", monthKey: "2026-09",
    weekStart: "2026-09-07", isCurrent: true, isPast: false, weekCount: 1,
  },
];

function ametelCell(): FlowMatrixCellDto {
  return {
    weekStart: "2026-08-31",
    plan: 0,
    committed: {
      total: 11_469_086,
      items: [
        {
          kind: "draft",
          dteId: "draft-ep",
          templateId: "tpl-pena",
          billingPeriod: "2026-09",
          label: "ANDALUZA DE MONTAJES",
          fecha: "2026-09-01",
          monto: 5_736_576,
          issueYmd: "2026-09-01",
          terminoDias: 2,
          cobroEstYmd: "2026-09-03",
          sentDocs: { proforma: false, estadoPago: true },
        },
        {
          kind: "draft",
          dteId: "draft-extra",
          templateId: undefined,
          billingPeriod: "2026-08",
          label: "Ametel",
          fecha: "2026-09-01",
          monto: 5_732_510,
          issueYmd: "2026-09-01",
          terminoDias: 2,
          cobroEstYmd: "2026-09-03",
          sentDocs: { proforma: false, estadoPago: false },
        },
      ],
    },
    real: null,
    effective: 11_469_086,
    layer: "committed",
  };
}

describe("CellCompositionPanel — EP vs extra por ítem", () => {
  it("separa origen, permite mover y excluir el extra del flujo", async () => {
    const onExcludeDte = vi.fn().mockResolvedValue(undefined);
    const onMoveDte = vi.fn();
    const onClose = vi.fn();
    render(
      <CellCompositionPanel
        cell={ametelCell()}
        canManage
        rowName="Ametel - Peñablanca"
        rowTemplateId="tpl-pena"
        moveWeeks={WEEKS}
        onExcludeDte={onExcludeDte}
        onMoveDte={onMoveDte}
        onViewDte={vi.fn()}
        onClose={onClose}
      />,
    );

    expect(screen.getByText("de la programación", { exact: false })).toBeTruthy();
    expect(screen.getByText("extra", { exact: false })).toBeTruthy();
    expect(screen.getByText("Mover este EP…")).toBeTruthy();
    expect(screen.getByText("Mover este B…")).toBeTruthy();

    const excludeBtns = screen.getAllByText("Excluir…");
    expect(excludeBtns).toHaveLength(2);
    fireEvent.click(excludeBtns[1]!);
    const input = screen.getByPlaceholderText("Ej: ya cobrada por factoring");
    fireEvent.change(input, { target: { value: "ya cobrada por factoring" } });
    await act(async () => {
      fireEvent.click(screen.getByText("Confirmar exclusión"));
    });
    expect(onExcludeDte).toHaveBeenCalledWith(
      "draft-extra",
      "ya cobrada por factoring",
    );
  });
});
