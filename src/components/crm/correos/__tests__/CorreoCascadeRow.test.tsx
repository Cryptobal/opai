/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Building2, Briefcase } from "lucide-react";
import { CorreoCascadeRow } from "../CorreoCascadeRow";

describe("CorreoCascadeRow", () => {
  it("con hasValue y editable expone control de edición que invoca onEdit", () => {
    const onEdit = vi.fn();
    render(
      <CorreoCascadeRow
        icon={Building2}
        label="Cuenta"
        value="CIMS"
        depth={0}
        hasValue
        editable
        href="/crm/accounts/1"
        onEdit={onEdit}
      />,
    );
    const edit = screen.getByRole("button", { name: "Editar Cuenta" });
    expect(edit).toBeTruthy();
    fireEvent.click(edit);
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it("sin editable no muestra el control de edición", () => {
    render(
      <CorreoCascadeRow
        icon={Building2}
        label="Cuenta"
        value="CIMS"
        depth={0}
        hasValue
        editable={false}
        href="/crm/accounts/1"
        onEdit={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "Editar Cuenta" })).toBeNull();
  });

  it("sin valor editable no muestra Vincular y el + abre onAdd", () => {
    const onAdd = vi.fn();
    render(
      <CorreoCascadeRow
        icon={Briefcase}
        label="Negocio"
        value={null}
        depth={1}
        hasValue={false}
        editable
        onAdd={onAdd}
      />,
    );
    expect(screen.queryByText("Vincular")).toBeNull();
    expect(screen.queryByText("Agregar")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Negocio/i }));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it("sin valor con onCreateWithAi expone botón Crear con IA", () => {
    const onCreateWithAi = vi.fn();
    render(
      <CorreoCascadeRow
        icon={Briefcase}
        label="Cotización"
        value={null}
        depth={2}
        hasValue={false}
        editable
        onAdd={vi.fn()}
        onCreateWithAi={onCreateWithAi}
      />,
    );
    const create = screen.getByRole("button", { name: "Crear Cotización con IA" });
    fireEvent.click(create);
    expect(onCreateWithAi).toHaveBeenCalledTimes(1);
  });
});
