import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TouchStepper } from "../TouchStepper";

describe("TouchStepper", () => {
  it("incrementa y decrementa dentro de los límites", () => {
    const onChange = vi.fn();
    render(
      <TouchStepper value={2} min={1} max={4} ariaLabel="guardias" onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /aumentar guardias/i }));
    expect(onChange).toHaveBeenCalledWith(3);
    fireEvent.click(screen.getByRole("button", { name: /disminuir guardias/i }));
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it("bloquea los extremos sin emitir cambios", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <TouchStepper value={1} min={1} max={3} ariaLabel="guardias" onChange={onChange} />,
    );
    const minus = screen.getByRole("button", { name: /disminuir guardias/i });
    expect(minus).toBeDisabled();
    fireEvent.click(minus);
    expect(onChange).not.toHaveBeenCalled();

    rerender(
      <TouchStepper value={3} min={1} max={3} ariaLabel="guardias" onChange={onChange} />,
    );
    const plus = screen.getByRole("button", { name: /aumentar guardias/i });
    expect(plus).toBeDisabled();
    fireEvent.click(plus);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("los botones cumplen el target táctil de 40px (≥38px del brief)", () => {
    render(
      <TouchStepper value={2} min={1} max={9} ariaLabel="número de puestos" onChange={vi.fn()} />,
    );
    for (const name of [/disminuir/i, /aumentar/i]) {
      const btn = screen.getByRole("button", { name });
      expect(btn.className).toContain("h-10");
      expect(btn.className).toContain("w-10");
    }
  });

  it("muestra el valor actual", () => {
    render(
      <TouchStepper value={7} ariaLabel="guardias" onChange={vi.fn()} />,
    );
    expect(screen.getByText("7")).toBeInTheDocument();
  });
});
