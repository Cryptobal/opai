import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DteQuickFilters } from "../DteQuickFilters";

describe("DteQuickFilters", () => {
  it("muestra Vista y Tipo; Factura electrónica viene marcada por defecto", () => {
    render(
      <DteQuickFilters
        quickFilter="ALL"
        onQuickFilter={() => {}}
        types={[33]}
        onToggleType={() => {}}
      />,
    );

    expect(screen.getByRole("group", { name: "Vista" })).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Tipo de documento" }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", { name: "Factura Electrónica" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: "Nota de Crédito" }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("alterna tipos de documento en multi-select", () => {
    const onToggleType = vi.fn();
    render(
      <DteQuickFilters
        quickFilter="ALL"
        onQuickFilter={() => {}}
        types={[33]}
        onToggleType={onToggleType}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Nota de Crédito" }));
    expect(onToggleType).toHaveBeenCalledWith(61);

    fireEvent.click(screen.getByRole("button", { name: "Factura Electrónica" }));
    expect(onToggleType).toHaveBeenCalledWith(33);
  });

  it("permite dejar todos los tipos desmarcados", () => {
    render(
      <DteQuickFilters
        quickFilter="ALL"
        onQuickFilter={() => {}}
        types={[]}
        onToggleType={() => {}}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Factura Electrónica" }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(
      screen.getByRole("button", { name: "Factura Exenta" }),
    ).toHaveAttribute("aria-pressed", "false");
  });
});
