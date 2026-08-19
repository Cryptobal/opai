import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MenuItems, type MenuItemDesc } from "../menu-render";

const items: MenuItemDesc[] = [
  { key: "edit", label: "Editar monto", onSelect: vi.fn() },
  {
    key: "move",
    label: "Mover a otra semana…",
    submenu: [
      { key: "w1", label: "sem 02/11/26", onSelect: vi.fn() },
      { key: "w2", label: "sem 09/11/26", onSelect: vi.fn() },
    ],
  },
];

describe("MenuItems panel — hover abre submenú", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("abre las semanas al poner el pointer sobre Mover a otra semana…", () => {
    render(<MenuItems items={items} variant="panel" onSheetClose={() => {}} />);

    expect(screen.getByText("Mover a otra semana…")).toBeTruthy();
    expect(screen.queryByText("sem 02/11/26")).toBeNull();

    fireEvent.pointerEnter(screen.getByText("Mover a otra semana…").closest("button")!);
    act(() => {
      vi.advanceTimersByTime(80);
    });

    expect(screen.getByText("sem 02/11/26")).toBeTruthy();
    expect(screen.getByText("sem 09/11/26")).toBeTruthy();
    expect(screen.getByText("← Mover a otra semana…")).toBeTruthy();
  });

  it("cancela la apertura si el pointer sale antes del delay", () => {
    render(<MenuItems items={items} variant="panel" onSheetClose={() => {}} />);

    const btn = screen.getByText("Mover a otra semana…").closest("button")!;
    fireEvent.pointerEnter(btn);
    fireEvent.pointerLeave(btn);
    act(() => {
      vi.advanceTimersByTime(120);
    });

    expect(screen.queryByText("sem 02/11/26")).toBeNull();
    expect(screen.getByText("Mover a otra semana…")).toBeTruthy();
  });

  it("en sheet no abre al hover (solo tap)", () => {
    render(<MenuItems items={items} variant="sheet" onSheetClose={() => {}} />);

    fireEvent.pointerEnter(screen.getByText("Mover a otra semana…").closest("button")!);
    act(() => {
      vi.advanceTimersByTime(120);
    });

    expect(screen.queryByText("sem 02/11/26")).toBeNull();
  });
});
