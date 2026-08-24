/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TruthBar } from "../TruthBar";

describe("TruthBar", () => {
  it("ancla por defecto bajo TerrenoModeSwitcher en un scrollport compartido", () => {
    render(<TruthBar gpsStatus="off" online />);
    const bar = screen.getByRole("status");
    expect(bar.style.top).toBe("var(--terreno-switcher-h, 0px)");
    expect(bar.className).toContain("sticky");
  });

  it("acepta stickyTop 0px para shells anidados bajo el switcher", () => {
    render(<TruthBar gpsStatus="off" online stickyTop="0px" />);
    const bar = screen.getByRole("status");
    expect(bar.style.top).toBe("0px");
    expect(bar.className).toContain("relative");
    expect(bar.className).not.toContain("sticky");
  });

  it("muestra Sin GPS y En línea", () => {
    render(<TruthBar gpsStatus="off" online />);
    expect(screen.getByText("Sin GPS")).toBeInTheDocument();
    expect(screen.getByText("En línea")).toBeInTheDocument();
  });

  it("con stickyTop 0px no desplaza la barra sobre el contenido siguiente", () => {
    render(
      <div className="flex flex-col overflow-hidden">
        <p>Ana Pérez</p>
        <TruthBar gpsStatus="off" online stickyTop="0px" />
      </div>,
    );
    expect(screen.getByText("Ana Pérez")).toBeVisible();
    expect(screen.getByText("Sin GPS")).toBeVisible();
    expect(screen.getByRole("status").style.top).toBe("0px");
  });
});
