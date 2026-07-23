import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AgendaFilterPopover } from "../desktop/AgendaFilterPopover";
import { AgendaTeamPopover } from "../desktop/AgendaTeamPopover";

const USERS = [
  { id: "u1", name: "Ana Rojas" },
  { id: "u2", name: "Beto Díaz" },
];

describe("AgendaTeamPopover", () => {
  it("abre en portal, multiselecciona y muestra hint sin Google", () => {
    const onChange = vi.fn();
    render(
      <AgendaTeamPopover
        users={USERS}
        selectedIds={["u1"]}
        onChange={onChange}
        googleByUserId={new Map([["u1", true], ["u2", false]])}
        buttonClass="btn"
      />,
    );

    fireEvent.click(screen.getByText("Ana Rojas"));
    // El contenido vive en un portal (document.body), no inline en el trigger.
    expect(screen.getByText("Todo el equipo")).toBeInTheDocument();
    expect(screen.getByText("sin Google")).toBeInTheDocument();

    // Toggle: agregar u2 al filtro conserva u1 (multiselect).
    fireEvent.click(screen.getByText("Beto Díaz"));
    expect(onChange).toHaveBeenCalledWith(["u1", "u2"]);

    // "Todo el equipo" limpia la selección.
    fireEvent.click(screen.getByText("Todo el equipo"));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("cierra con Esc", () => {
    render(
      <AgendaTeamPopover
        users={USERS}
        selectedIds={[]}
        onChange={() => {}}
        googleByUserId={null}
        buttonClass="btn"
      />,
    );
    fireEvent.click(screen.getByText("Equipo"));
    expect(screen.getByText("Todo el equipo")).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    expect(screen.queryByText("Todo el equipo")).not.toBeInTheDocument();
  });
});

describe("AgendaFilterPopover", () => {
  it("muestra grupos Contenido y Tipo y notifica cambios", () => {
    const onContent = vi.fn();
    render(
      <AgendaFilterPopover
        contentFilter="todo"
        typeFilter="todos"
        onContentFilterChange={onContent}
        onTypeFilterChange={() => {}}
        buttonClass="btn"
      />,
    );
    fireEvent.click(screen.getByLabelText("Filtros"));
    expect(screen.getByText("Contenido")).toBeInTheDocument();
    expect(screen.getByText("Tipo")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Tareas"));
    expect(onContent).toHaveBeenCalledWith("tareas");
  });
});
