import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FilterPopover, type FilterGroup } from "../FilterPopover";

function makeGroups(onToggle = () => {}): FilterGroup[] {
  return [
    {
      title: "Asociación",
      options: [
        { id: "con_cuenta", label: "Con cuenta", checked: false, onToggle },
        { id: "sin_asociar", label: "Sin asociar", checked: true, onToggle },
      ],
    },
  ];
}

describe("FilterPopover", () => {
  it("renders the trigger but no panel while closed", () => {
    render(
      <FilterPopover
        groups={makeGroups()}
        open={false}
        onOpenChange={() => {}}
        trigger={<button>Filtros</button>}
      />,
    );
    expect(screen.getByText("Filtros")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders grouped options when open", () => {
    render(
      <FilterPopover
        groups={makeGroups()}
        open
        onOpenChange={() => {}}
        trigger={<button>Abrir</button>}
      />,
    );
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Asociación")).toBeTruthy();
    expect((screen.getByLabelText("Con cuenta") as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText("Sin asociar") as HTMLInputElement).checked).toBe(true);
  });

  it("calls the option's onToggle when checked", () => {
    const onToggle = vi.fn();
    render(
      <FilterPopover
        groups={makeGroups(onToggle)}
        open
        onOpenChange={() => {}}
        trigger={<button>Abrir</button>}
      />,
    );
    fireEvent.click(screen.getByLabelText("Con cuenta"));
    expect(onToggle).toHaveBeenCalled();
  });

  it("closes on Escape", () => {
    const onOpenChange = vi.fn();
    render(
      <FilterPopover
        groups={makeGroups()}
        open
        onOpenChange={onOpenChange}
        trigger={<button>Abrir</button>}
      />,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("closes on click outside but not on click inside", () => {
    const onOpenChange = vi.fn();
    render(
      <div>
        <FilterPopover
          groups={makeGroups()}
          open
          onOpenChange={onOpenChange}
          trigger={<button>Abrir</button>}
        />
        <span data-testid="outside">fuera</span>
      </div>,
    );

    fireEvent.mouseDown(screen.getByRole("dialog"));
    expect(onOpenChange).not.toHaveBeenCalled();

    fireEvent.mouseDown(screen.getByTestId("outside"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("exposes a Limpiar action only when onClear is given", () => {
    const onClear = vi.fn();
    const { rerender } = render(
      <FilterPopover
        groups={makeGroups()}
        open
        onOpenChange={() => {}}
        trigger={<button>Abrir</button>}
      />,
    );
    expect(screen.queryByText("Limpiar")).toBeNull();

    rerender(
      <FilterPopover
        groups={makeGroups()}
        open
        onOpenChange={() => {}}
        onClear={onClear}
        trigger={<button>Abrir</button>}
      />,
    );
    fireEvent.click(screen.getByText("Limpiar"));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
