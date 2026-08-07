import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceRail } from "../WorkspaceRail";

describe("WorkspaceRail", () => {
  it("muestra etiquetas cuando está expandido", () => {
    render(
      <WorkspaceRail
        onNavigate={vi.fn()}
        collapsed={false}
        onCollapsedChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Datos" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Financieros" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Contraer secciones" })).toBeInTheDocument();
    expect(screen.getByText("Secciones")).toBeInTheDocument();
  });

  it("contrae a iconos y notifica el cambio", () => {
    const onCollapsedChange = vi.fn();
    render(
      <WorkspaceRail
        onNavigate={vi.fn()}
        collapsed={false}
        onCollapsedChange={onCollapsedChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Contraer secciones" }));
    expect(onCollapsedChange).toHaveBeenCalledWith(true);
  });

  it("en modo colapsado sigue navegando por aria-label", () => {
    const onNavigate = vi.fn();
    render(
      <WorkspaceRail
        onNavigate={onNavigate}
        collapsed
        onCollapsedChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Expandir secciones" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Puestos" }));
    expect(onNavigate).toHaveBeenCalledWith("sec-puestos");
  });
});
