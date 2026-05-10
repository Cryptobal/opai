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
      target={{ id: "occ-1", amountClp: 500_000 }}
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

  it("expone los nuevos botones (1 día, 1 sem, 2 sem, 1 mes en ambos sentidos + fecha exacta + editar)", async () => {
    renderPopover();
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => {
      // 8 botones de shift + fecha exacta + editar monto = al menos esos textos
      expect(screen.getAllByText(/1 día/).length).toBe(2);
      expect(screen.getAllByText(/1 sem/).length).toBe(2);
      expect(screen.getAllByText(/2 sem/).length).toBe(2);
      expect(screen.getAllByText(/1 mes/).length).toBe(2);
      expect(screen.getByText(/Fecha exacta/)).toBeTruthy();
      expect(screen.getByText(/Editar monto/)).toBeTruthy();
    });
  });

  it("click en '1 sem ←' llama POST /move con daysFromCurrent=-7", async () => {
    const { onActionDone } = renderPopover();
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => screen.getAllByText(/1 sem/));
    const [backOneWeek] = screen.getAllByText(/1 sem/);
    fireEvent.click(backOneWeek);
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

  it("click en '1 mes →' usa daysFromCurrent=30", async () => {
    renderPopover();
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => screen.getAllByText(/1 mes/));
    const monthButtons = screen.getAllByText(/1 mes/);
    fireEvent.click(monthButtons[1]);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/finance/cashflow/occurrences/occ-1/move",
        expect.objectContaining({
          body: JSON.stringify({ daysFromCurrent: 30 }),
        }),
      );
    });
  });

  it("click en 'Fecha exacta...' abre el calendario", async () => {
    renderPopover();
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => screen.getByText(/Fecha exacta/));
    fireEvent.click(screen.getByText(/Fecha exacta/));
    await waitFor(() => {
      expect(screen.getByText(/Mover a fecha exacta/)).toBeTruthy();
      // Calendar de DayPicker tiene un grid role
      expect(screen.getAllByRole("grid").length).toBeGreaterThan(0);
    });
  });
});
