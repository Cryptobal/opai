import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LineasSection } from "../LineasSection";
import type { CpqQuoteAdditionalLine } from "@/types/cpq";

function line(over: Partial<CpqQuoteAdditionalLine> = {}): CpqQuoteAdditionalLine {
  return {
    nombre: "Ronda motorizada",
    descripcion: "2 rondas nocturnas",
    precio: 200_000,
    orden: 0,
    tipo: "servicio",
    recurrencia: "mensual",
    cantidad: 1,
    marginPct: null,
    ...over,
  } as CpqQuoteAdditionalLine;
}

function renderSection(
  props: Partial<React.ComponentProps<typeof LineasSection>> = {},
) {
  const setLines = vi.fn();
  const onSaveNow = vi.fn();
  const utils = render(
    <LineasSection
      open
      onToggle={vi.fn()}
      lines={[line()]}
      setLines={setLines}
      isLocked={false}
      currency="CLP"
      ufValue={40_000}
      addlIsUf={false}
      addlToInput={(clp) => clp}
      addlFromInput={(v) => v}
      additionalLinesTotal={200_000}
      savingFinancials={false}
      onSaveNow={onSaveNow}
      {...props}
    />,
  );
  return { ...utils, setLines, onSaveNow };
}

describe("LineasSection", () => {
  it("renderiza la línea con su nombre, descripción y total", () => {
    renderSection();
    expect(screen.getByDisplayValue("Ronda motorizada")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2 rondas nocturnas")).toBeInTheDocument();
    expect(screen.getByText("Total líneas adicionales")).toBeInTheDocument();
  });

  it("marca el pago único y no lo presenta como mensual", () => {
    renderSection({
      lines: [line({ recurrencia: "unico", nombre: "Instalación CCTV" })],
      additionalLinesTotal: 0,
    });
    expect(screen.getByText("pago único")).toBeInTheDocument();
    expect(screen.getByText("Se cobra una sola vez")).toBeInTheDocument();
    expect(screen.queryByText("/mes")).not.toBeInTheDocument();
  });

  it("agregar línea añade una fila mensual por defecto", () => {
    const { setLines } = renderSection({ lines: [] });
    fireEvent.click(screen.getByRole("button", { name: /agregar línea/i }));
    const updater = setLines.mock.calls[0]![0] as (
      prev: CpqQuoteAdditionalLine[],
    ) => CpqQuoteAdditionalLine[];
    const next = updater([]);
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ recurrencia: "mensual", tipo: "servicio", cantidad: 1 });
  });

  it("eliminar quita solo la línea seleccionada", () => {
    const lines = [line({ nombre: "A" }), line({ nombre: "B", orden: 1 })];
    const { setLines } = renderSection({ lines });
    const deleteButtons = screen
      .getAllByRole("button")
      .filter((b) => b.className.includes("text-status-danger-fg/60"));
    fireEvent.click(deleteButtons[1]!);
    const updater = setLines.mock.calls[0]![0] as (
      prev: CpqQuoteAdditionalLine[],
    ) => CpqQuoteAdditionalLine[];
    expect(updater(lines).map((l) => l.nombre)).toEqual(["A"]);
  });

  it("cotización enviada: sin acciones de edición", () => {
    renderSection({ isLocked: true });
    expect(screen.queryByRole("button", { name: /agregar línea/i })).not.toBeInTheDocument();
  });

  it("en UF el precio se ingresa en UF y se convierte a CLP", () => {
    const { setLines } = renderSection({
      currency: "UF",
      addlIsUf: true,
      addlToInput: (clp) => clp / 40_000,
      addlFromInput: (uf) => uf * 40_000,
      lines: [line({ precio: 80_000 })],
    });
    expect(screen.getAllByText("UF").length).toBeGreaterThan(0);
    const input = screen.getByPlaceholderText("Precio") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "3" } });
    fireEvent.blur(input);
    const updated = setLines.mock.calls.at(-1)![0] as CpqQuoteAdditionalLine[];
    expect(Number(updated[0]!.precio)).toBe(120_000);
  });
});
