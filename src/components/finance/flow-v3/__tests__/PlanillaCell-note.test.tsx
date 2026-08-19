/**
 * Notas de celda: sin texto dentro de la celda; indicador + tooltip.
 */
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { FlowMatrixCellDto } from "@/modules/finance/flow-v3/matrix-types";
import { PlanillaCell } from "../PlanillaCell";

const NOTE = "Prestamo CIG a socios por liquidacion de agosto";

function baseCell(over: Partial<FlowMatrixCellDto> = {}): FlowMatrixCellDto {
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
    note: NOTE,
    ...over,
  };
}

function noop() {}

function renderCell(
  cell: FlowMatrixCellDto,
  extras: Partial<Parameters<typeof PlanillaCell>[0]> = {},
) {
  return render(
    <TooltipProvider delayDuration={0}>
      <table>
        <tbody>
          <tr>
            <PlanillaCell
              section="FINANCIAMIENTO"
              cell={cell}
              editable={false}
              rangeClass=""
              editingInitial={null}
              onSelect={noop}
              onStartEdit={noop}
              onCommit={noop}
              onCancel={noop}
              onOpenPopover={noop}
              onContextTarget={noop}
              onOpenNote={vi.fn()}
              draggable={false}
              onDragStartCell={noop}
              onDragOverCell={noop}
              onDropCell={noop}
              onDragEndCell={noop}
              isDropTarget={false}
              showChips={false}
              {...extras}
            />
          </tr>
        </tbody>
      </table>
    </TooltipProvider>,
  );
}

describe("PlanillaCell — nota", () => {
  it("no pinta el texto de la nota dentro de la celda; muestra el punto azul", () => {
    renderCell(baseCell());
    const td = screen.getByRole("cell");
    expect(td.textContent).not.toContain("Prestamo");
    expect(screen.getByRole("button", { name: /ver \/ editar nota/i })).toBeTruthy();
  });

  it("al hover del punto muestra la nota en el tooltip", async () => {
    renderCell(baseCell());
    fireEvent.pointerMove(screen.getByRole("button", { name: /ver \/ editar nota/i }));
    fireEvent.focus(screen.getByRole("button", { name: /ver \/ editar nota/i }));
    await waitFor(() => {
      expect(screen.getByRole("tooltip")).toHaveTextContent(NOTE);
    });
  });

  it("clic en el punto llama onOpenNote", () => {
    const onOpenNote = vi.fn();
    renderCell(baseCell(), { onOpenNote });
    fireEvent.click(screen.getByRole("button", { name: /ver \/ editar nota/i }));
    expect(onOpenNote).toHaveBeenCalledTimes(1);
  });
});
