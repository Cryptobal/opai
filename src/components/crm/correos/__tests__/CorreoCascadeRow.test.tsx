/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Building2 } from "lucide-react";
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
});
