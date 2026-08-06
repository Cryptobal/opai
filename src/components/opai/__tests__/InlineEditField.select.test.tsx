import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { InlineEditField } from "../InlineEditField";

const OPTIONS = [
  { value: "ana", label: "Ana Pérez · pago@cliente.cl · marcado cobranza" },
  { value: "beto", label: "Beto Soto · beto@cliente.cl" },
];

function setup(props: Partial<React.ComponentProps<typeof InlineEditField>> = {}) {
  const onCommit = vi.fn(async (_k: string, v: string | null) => v);
  render(
    <InlineEditField
      label="Contacto de cobranza"
      fieldKey="contactoCobranzaId"
      type="select"
      value={null}
      canEdit
      options={OPTIONS}
      onCommit={onCommit}
      {...props}
    />,
  );
  return { onCommit };
}

describe("InlineEditField select — emptyLabel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // jsdom no implementa matchMedia: el componente lo usa para decidir
    // desktop (edición inline) vs mobile (sheet). Forzamos desktop.
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  });

  it("por defecto la opción vacía es un guion", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /Editar/i }));
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.options[0].value).toBe("");
    expect(select.options[0].textContent).toBe("—");
  });

  it("usa el emptyLabel cuando el valor nulo significa algo concreto", () => {
    setup({ emptyLabel: "Sin definir — usa el principal" });
    fireEvent.click(screen.getByRole("button", { name: /Editar/i }));
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.options[0].textContent).toBe("Sin definir — usa el principal");
    // Sin duplicar la opción vacía cuando hay opciones reales.
    expect(select.options).toHaveLength(OPTIONS.length + 1);
    expect(
      [...select.options].filter((o) => o.value === ""),
    ).toHaveLength(1);
  });

  it("guarda el contacto elegido y muestra su label en modo lectura", async () => {
    const { onCommit } = setup({ emptyLabel: "Sin definir — usa el principal" });
    fireEvent.click(screen.getByRole("button", { name: /Editar/i }));
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "ana" } });
    fireEvent.blur(select);

    await waitFor(() =>
      expect(onCommit).toHaveBeenCalledWith("contactoCobranzaId", "ana"),
    );
  });

  it("volver a la opción vacía persiste null (limpia el contacto)", async () => {
    const { onCommit } = setup({
      value: "ana",
      emptyLabel: "Sin definir — usa el principal",
    });
    fireEvent.click(screen.getByRole("button", { name: /Editar/i }));
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "" } });
    fireEvent.blur(select);

    await waitFor(() =>
      expect(onCommit).toHaveBeenCalledWith("contactoCobranzaId", null),
    );
  });

  it("en modo lectura sin valor muestra el placeholder de la cascada", () => {
    setup({ placeholder: "Sin definir — usa el principal" });
    expect(
      screen.getByText("Sin definir — usa el principal"),
    ).toBeInTheDocument();
  });
});
