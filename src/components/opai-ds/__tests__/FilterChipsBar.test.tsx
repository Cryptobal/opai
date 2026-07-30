import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FilterChipsBar } from "../FilterChipsBar";

describe("FilterChipsBar", () => {
  it("renders nothing when there are no chips", () => {
    const { container } = render(<FilterChipsBar chips={[]} onClearAll={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders one chip per filter", () => {
    render(
      <FilterChipsBar
        chips={[
          { key: "status", label: "Activos", onClear: () => {} },
          { key: "sla", label: "SLA vencidos", onClear: () => {} },
        ]}
      />,
    );
    expect(screen.getByText("Activos")).toBeTruthy();
    expect(screen.getByText("SLA vencidos")).toBeTruthy();
  });

  it("calls the chip's own onClear when its remove button is pressed", () => {
    const onClear = vi.fn();
    const other = vi.fn();
    render(
      <FilterChipsBar
        chips={[
          { key: "status", label: "Activos", onClear },
          { key: "sla", label: "SLA vencidos", onClear: other },
        ]}
      />,
    );
    fireEvent.click(screen.getByLabelText("Quitar filtro Activos"));
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(other).not.toHaveBeenCalled();
  });

  it("shows 'Limpiar todo' only when onClearAll is provided", () => {
    const chips = [{ key: "a", label: "A", onClear: () => {} }];
    const { rerender } = render(<FilterChipsBar chips={chips} />);
    expect(screen.queryByText("Limpiar todo")).toBeNull();

    const onClearAll = vi.fn();
    rerender(<FilterChipsBar chips={chips} onClearAll={onClearAll} />);
    fireEvent.click(screen.getByText("Limpiar todo"));
    expect(onClearAll).toHaveBeenCalledTimes(1);
  });
});
