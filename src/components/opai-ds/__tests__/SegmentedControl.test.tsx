import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SegmentedControl } from "../SegmentedControl";

describe("SegmentedControl", () => {
  const items = [
    { id: "todos", label: "Todos", count: 12 },
    { id: "no_leidos", label: "No leídos", count: 3 },
    { id: "con_tareas", label: "Con tareas" },
  ];

  it("renders every item as a tab", () => {
    render(<SegmentedControl items={items} value="todos" onChange={() => {}} />);
    expect(screen.getByText("Todos")).toBeTruthy();
    expect(screen.getByText("No leídos")).toBeTruthy();
    expect(screen.getByText("Con tareas")).toBeTruthy();
  });

  it("marks only the selected item with aria-selected=true", () => {
    render(<SegmentedControl items={items} value="no_leidos" onChange={() => {}} />);
    expect(screen.getByRole("tab", { name: /No leídos/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: /Todos/ }).getAttribute("aria-selected")).toBe("false");
  });

  it("calls onChange with the item id when clicked", () => {
    const onChange = vi.fn();
    render(<SegmentedControl items={items} value="todos" onChange={onChange} />);
    fireEvent.click(screen.getByRole("tab", { name: /Con tareas/ }));
    expect(onChange).toHaveBeenCalledWith("con_tareas");
  });

  it("renders counts when present and omits them when undefined or null", () => {
    render(
      <SegmentedControl
        items={[
          { id: "a", label: "A", count: 5 },
          { id: "b", label: "B" },
          { id: "c", label: "C", count: null },
        ]}
        value="a"
        onChange={() => {}}
      />,
    );
    expect(screen.getByText("5")).toBeTruthy();
    // Counts nulos/ausentes no rompen el render ni pintan número.
    expect(screen.getByRole("tab", { name: "B" }).textContent).toBe("B");
    expect(screen.getByRole("tab", { name: "C" }).textContent).toBe("C");
  });

  it("clamps large counts to 999+", () => {
    render(
      <SegmentedControl items={[{ id: "a", label: "A", count: 4200 }]} value="a" onChange={() => {}} />,
    );
    expect(screen.getByText("999+")).toBeTruthy();
  });

  it("does not fire onChange for a disabled item", () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        items={[
          { id: "a", label: "A" },
          { id: "b", label: "B", disabled: true, title: "No disponible durante la búsqueda" },
        ]}
        value="a"
        onChange={onChange}
      />,
    );
    const disabled = screen.getByRole("tab", { name: "B" }) as HTMLButtonElement;
    expect(disabled.disabled).toBe(true);
    fireEvent.click(disabled);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("renders nothing when items is empty", () => {
    const { container } = render(<SegmentedControl items={[]} value="a" onChange={() => {}} />);
    expect(container.firstChild).toBeNull();
  });
});
