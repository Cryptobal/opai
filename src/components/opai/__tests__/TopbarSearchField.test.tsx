/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { IslandSearch } from "@/components/opai-ds";

const mockSearch = vi.fn((): IslandSearch | null => null);

vi.mock("@/components/opai-ds", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/opai-ds")>();
  return {
    ...actual,
    useModuleSurface: () => ({
      search: mockSearch(),
      moduleMenu: null,
      suppressed: false,
    }),
    useIslandSearchOpenListener: () => {},
  };
});

import { TopbarSearchField } from "../TopbarSearchField";

function searchStub(partial: Partial<IslandSearch> = {}): IslandSearch {
  return {
    placeholder: "Buscar correos",
    value: "",
    onChange: vi.fn(),
    onExit: vi.fn(),
    operators: [{ token: "from:", hint: "remitente" }],
    ...partial,
  };
}

describe("TopbarSearchField", () => {
  it("no renderiza si search es null", () => {
    mockSearch.mockReturnValue(null);
    const { container } = render(<TopbarSearchField />);
    expect(container.firstChild).toBeNull();
  });

  it("expone id=module-search-input", () => {
    mockSearch.mockReturnValue(searchStub());
    render(<TopbarSearchField />);
    expect(document.getElementById("module-search-input")).toBeTruthy();
  });

  it("el input anula ring/outline de focus-visible (sin rectángulo interno)", () => {
    mockSearch.mockReturnValue(searchStub());
    render(<TopbarSearchField />);
    const input = document.getElementById("module-search-input");
    expect(input?.className).toMatch(/focus-visible:ring-0/);
    expect(input?.className).toMatch(/focus-visible:ring-offset-0/);
    expect(input?.className).toMatch(/focus-visible:outline-none/);
  });

  it("renderiza chips y al quitar uno llama onChange sin el token", () => {
    const onChange = vi.fn();
    mockSearch.mockReturnValue(
      searchStub({ value: "from:ana has:attachment", onChange }),
    );
    render(<TopbarSearchField />);
    expect(screen.getByTitle("Quitar from:ana")).toBeTruthy();
    expect(screen.getByTitle("Quitar has:attachment")).toBeTruthy();
    fireEvent.click(screen.getByTitle("Quitar from:ana"));
    expect(onChange).toHaveBeenCalledWith("has:attachment");
  });

  it("limpiar llama onChange(\"\") y onExit", () => {
    const onChange = vi.fn();
    const onExit = vi.fn();
    mockSearch.mockReturnValue(
      searchStub({ value: "hola", onChange, onExit }),
    );
    render(<TopbarSearchField />);
    fireEvent.click(screen.getByLabelText("Limpiar búsqueda"));
    expect(onChange).toHaveBeenCalledWith("");
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});

describe("TopbarSearchField — popover de operadores", () => {
  it("el botón embudo abre el popover y lo cierra al reclicar", () => {
    mockSearch.mockReturnValue(searchStub());
    render(<TopbarSearchField />);
    const btn = screen.getByLabelText("Filtros de búsqueda");
    fireEvent.click(btn);
    expect(screen.getByRole("listbox")).toBeTruthy();
    // Reclic: el mousedown de documento no debe interceptar el toggle.
    fireEvent.click(btn);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("Escape y clic afuera cierran el popover", () => {
    mockSearch.mockReturnValue(searchStub());
    render(<TopbarSearchField />);
    fireEvent.click(screen.getByLabelText("Filtros de búsqueda"));
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();

    fireEvent.click(screen.getByLabelText("Filtros de búsqueda"));
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("token con valor fijo se inserta y cierra el popover", () => {
    const onChange = vi.fn();
    mockSearch.mockReturnValue(
      searchStub({
        value: "",
        onChange,
        operators: [{ token: "has:attachment", hint: "con adjuntos" }],
      }),
    );
    render(<TopbarSearchField />);
    fireEvent.click(screen.getByLabelText("Filtros de búsqueda"));
    fireEvent.click(screen.getByRole("option", { name: /has:attachment/ }));
    expect(onChange).toHaveBeenCalledWith("has:attachment");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("token terminado en ':' deja el foco en el input tras insertar", async () => {
    const onChange = vi.fn();
    mockSearch.mockReturnValue(
      searchStub({
        value: "foo",
        onChange,
        operators: [{ token: "from:", hint: "remitente" }],
      }),
    );
    render(<TopbarSearchField />);
    fireEvent.click(screen.getByLabelText("Filtros de búsqueda"));
    fireEvent.click(screen.getByRole("option", { name: /from:/ }));
    expect(onChange).toHaveBeenCalledWith("foo from:");
    expect(screen.queryByRole("listbox")).toBeNull();
    const input = document.getElementById("module-search-input");
    await waitFor(() => expect(document.activeElement).toBe(input));
  });
});
