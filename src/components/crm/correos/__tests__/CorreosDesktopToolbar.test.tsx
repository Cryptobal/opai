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
  totalCount: 10,
  previewLines: 2 as const,
  onPreviewLines: vi.fn(),
  selectedCount: 0,
  allReadSelected: false,
  onClear: vi.fn(),
  onAction: vi.fn(),
  onSnooze: vi.fn(),
};

describe("CorreosDesktopToolbar — operadores bajo demanda", () => {
  it("oculta la fila Operadores con query vacía y sin foco", () => {
    const { container } = render(
      <CorreosDesktopToolbar {...base} query="" onQuery={vi.fn()} />,
    );
    const label = screen.getByText("Operadores");
    const ops = label.closest("[aria-hidden]");
    expect(ops?.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector("[aria-hidden='false']")).toBeNull();
  });

  it("muestra operadores al enfocar el input", () => {
    const { container } = render(
      <CorreosDesktopToolbar {...base} query="" onQuery={vi.fn()} />,
    );
    fireEvent.focus(screen.getByPlaceholderText(/Buscá lo que recordás/i));
    const ops = container.querySelector("[aria-hidden='false']");
    expect(ops).toBeTruthy();
    expect(screen.getByText("from:")).toBeTruthy();
  });

  it("muestra operadores con query no vacía y se pliega al limpiar", () => {
    const onQuery = vi.fn();
    const { rerender, container } = render(
      <CorreosDesktopToolbar {...base} query="from:a" onQuery={onQuery} />,
    );
    expect(container.querySelector("[aria-hidden='false']")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Limpiar búsqueda"));
    expect(onQuery).toHaveBeenCalledWith("");

    rerender(<CorreosDesktopToolbar {...base} query="" onQuery={onQuery} />);
    expect(container.querySelector("[aria-hidden='true']")).toBeTruthy();
  });
});
