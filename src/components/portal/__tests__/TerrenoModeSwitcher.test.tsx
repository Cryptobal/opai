/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TerrenoModeSwitcher } from "../TerrenoModeSwitcher";

describe("TerrenoModeSwitcher", () => {
  const originalLocation = window.location;
  const assign = vi.fn();

  beforeEach(() => {
    assign.mockReset();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        ...originalLocation,
        href: "http://localhost/portal/acceso",
        assign,
      },
      writable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });

  it("always renders the three portal modes", () => {
    render(<TerrenoModeSwitcher active="acceso" />);

    expect(screen.getByRole("tablist", { name: /portal terreno/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Marcación" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Rondas" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Acceso" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Acceso" })).toHaveAttribute("aria-selected", "true");
  });

  it("navigates when tapping a non-active mode", () => {
    render(<TerrenoModeSwitcher active="acceso" />);
    fireEvent.click(screen.getByRole("tab", { name: "Rondas" }));
    expect(assign).toHaveBeenCalledWith("/portal/rondas");
  });

  it("does not navigate when tapping the active mode", () => {
    render(<TerrenoModeSwitcher active="acceso" />);
    fireEvent.click(screen.getByRole("tab", { name: "Acceso" }));
    expect(assign).not.toHaveBeenCalled();
  });
});
