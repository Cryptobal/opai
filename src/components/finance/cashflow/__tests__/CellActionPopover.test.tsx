import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CellActionPopover } from "../CellActionPopover";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    json: async () => ({ success: true }),
  });
});

function renderPopover() {
  const onActionDone = vi.fn();
  const utils = render(
    <CellActionPopover
      target={{
        id: "occ-1",
        itemId: "item-1",
        originalDate: "2026-05-15",
        amountClp: 500_000,
      }}
      granularity="weekly"
      onActionDone={onActionDone}
    >
      <span data-testid="cell-content">$500.000</span>
    </CellActionPopover>,
  );
  return { ...utils, onActionDone };
}

describe("CellActionPopover — botones extendidos", () => {
  it("renderiza el children sin envoltura cuando target=null", () => {
    render(
      <CellActionPopover target={null} granularity="weekly" onActionDone={() => {}}>
        <span data-testid="cell-content">$500.000</span>
      </CellActionPopover>,
    );
    expect(screen.getByTestId("cell-content")).toBeTruthy();
    // No hay popover trigger
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("expone los controles de mover (1 sem / 2 sem ←→) + fecha exacta + editar monto", async () => {
    renderPopover();
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => {
      // Filas ←/→ por opción de shift (1 sem y 2 sem).
      expect(screen.getByText("1 sem")).toBeTruthy();
      expect(screen.getByText("2 sem")).toBeTruthy();
      expect(screen.getByLabelText("Mover 1 sem hacia atrás")).toBeTruthy();
      expect(screen.getByLabelText("Mover 1 sem hacia adelante")).toBeTruthy();
      expect(screen.getByLabelText("Mover 2 sem hacia atrás")).toBeTruthy();
      expect(screen.getByLabelText("Mover 2 sem hacia adelante")).toBeTruthy();
      expect(screen.getByText(/Mover a fecha exacta/)).toBeTruthy();
      expect(screen.getByText(/Editar monto/)).toBeTruthy();
    });
  });

  it("click en '1 sem ←' llama POST /move con daysFromCurrent=-7", async () => {
    const { onActionDone } = renderPopover();
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => screen.getByLabelText("Mover 1 sem hacia atrás"));
    fireEvent.click(screen.getByLabelText("Mover 1 sem hacia atrás"));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/finance/cashflow/occurrences/occ-1/move",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ daysFromCurrent: -7 }),
        }),
      );
      expect(onActionDone).toHaveBeenCalled();
    });
  });

  it("click en '2 sem →' usa daysFromCurrent=14", async () => {
    renderPopover();
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => screen.getByLabelText("Mover 2 sem hacia adelante"));
    fireEvent.click(screen.getByLabelText("Mover 2 sem hacia adelante"));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/finance/cashflow/occurrences/occ-1/move",
        expect.objectContaining({
          body: JSON.stringify({ daysFromCurrent: 14 }),
        }),
      );
    });
  });

  it("click en 'Mover a fecha exacta…' abre el calendario", async () => {
    renderPopover();
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => screen.getByText(/Mover a fecha exacta/));
    fireEvent.click(screen.getByText(/Mover a fecha exacta/));
    await waitFor(() => {
      expect(screen.getByText(/Elegí una fecha/)).toBeTruthy();
      // Calendar de DayPicker tiene un grid role
      expect(screen.getAllByRole("grid").length).toBeGreaterThan(0);
    });
  });
});
