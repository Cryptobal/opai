/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TerrenoModeSwitcher } from "../TerrenoModeSwitcher";

describe("TerrenoModeSwitcher", () => {
  const originalLocation = window.location;

  beforeEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, href: "http://localhost/portal/acceso" },
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
    expect(window.location.href).toBe("/portal/rondas");
  });

  it("does not navigate when tapping the active mode", () => {
    render(<TerrenoModeSwitcher active="acceso" />);
    const before = window.location.href;
    fireEvent.click(screen.getByRole("tab", { name: "Acceso" }));
    expect(window.location.href).toBe(before);
  });
});
