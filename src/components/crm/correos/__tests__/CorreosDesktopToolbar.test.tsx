/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CorreosDesktopToolbar } from "../CorreosDesktopToolbar";

const base = {
  canModify: true,
  allChecked: false,
  onToggleAll: vi.fn(),
  onRefresh: vi.fn(),
  syncing: false,
  shownCount: 3,
  totalCount: 10 as number | null,
  previewLines: 2 as const,
  onPreviewLines: vi.fn(),
  selectedCount: 0,
  allReadSelected: false,
  onClear: vi.fn(),
  onAction: vi.fn(),
  onSnooze: vi.fn(),
};

describe("CorreosDesktopToolbar", () => {
  it("en reposo muestra el contador y no el botón de atajos", () => {
    render(<CorreosDesktopToolbar {...base} />);
    expect(screen.getByText("3 de 10")).toBeTruthy();
    expect(screen.queryByTitle("Atajos de teclado (?)")).toBeNull();
    expect(screen.queryByTitle(/Atajos/i)).toBeNull();
  });

  it("renderiza el contador sin totalCount", () => {
    render(<CorreosDesktopToolbar {...base} totalCount={null} />);
    expect(screen.getByText("3 hilos")).toBeTruthy();
  });

  it("en búsqueda muestra «N resultados» cuando coincide el total", () => {
    render(
      <CorreosDesktopToolbar {...base} searching shownCount={1} totalCount={1} />,
    );
    expect(screen.getByText("1 resultado")).toBeTruthy();
  });

  it("dispara onToggleAll al hacer clic en el checkbox", () => {
    const onToggleAll = vi.fn();
    render(<CorreosDesktopToolbar {...base} onToggleAll={onToggleAll} />);
    fireEvent.click(screen.getByLabelText("Seleccionar todo lo visible"));
    expect(onToggleAll).toHaveBeenCalledTimes(1);
  });

  it("dispara onRefresh y deshabilita con syncing", () => {
    const onRefresh = vi.fn();
    const { rerender } = render(
      <CorreosDesktopToolbar {...base} onRefresh={onRefresh} />,
    );
    const btn = screen.getByTitle("Sincronizar ahora");
    fireEvent.click(btn);
    expect(onRefresh).toHaveBeenCalledTimes(1);

    rerender(<CorreosDesktopToolbar {...base} onRefresh={onRefresh} syncing />);
    expect(screen.getByTitle("Sincronizando…")).toBeDisabled();
  });

  it("alterna densidad entre 1 y 2 líneas", () => {
    const onPreviewLines = vi.fn();
    const { rerender } = render(
      <CorreosDesktopToolbar {...base} onPreviewLines={onPreviewLines} previewLines={2} />,
    );
    fireEvent.click(screen.getByTitle("Densidad compacta"));
    expect(onPreviewLines).toHaveBeenCalledWith(1);

    rerender(
      <CorreosDesktopToolbar {...base} onPreviewLines={onPreviewLines} previewLines={1} />,
    );
    fireEvent.click(screen.getByTitle("Densidad cómoda"));
    expect(onPreviewLines).toHaveBeenCalledWith(2);
  });

  it("con selección muestra las seis acciones masivas y el contador", () => {
    const onAction = vi.fn();
    render(
      <CorreosDesktopToolbar
        {...base}
        selectedCount={2}
        onAction={onAction}
      />,
    );
    expect(screen.getByText("2 seleccionados")).toBeTruthy();
    expect(screen.getByTitle("Archivar")).toBeTruthy();
    expect(screen.getByTitle("Mover a la Papelera")).toBeTruthy();
    expect(screen.getByTitle("Marcar leídos")).toBeTruthy();
    expect(screen.getByTitle("Destacar")).toBeTruthy();
    expect(screen.getByTitle("Posponer")).toBeTruthy();
    expect(screen.getByTitle("Marcar spam")).toBeTruthy();
    fireEvent.click(screen.getByTitle("Marcar spam"));
    expect(onAction).toHaveBeenCalledWith("spam", "Marcados como spam", {
      undo: "unspam",
      removes: true,
    });
  });
});

