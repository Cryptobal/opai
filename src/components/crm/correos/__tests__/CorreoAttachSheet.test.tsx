/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CorreoAttachSheet } from "../CorreoAttachSheet";

describe("CorreoAttachSheet", () => {
  it("no renderiza cuando open=false", () => {
    const { container } = render(
      <CorreoAttachSheet open={false} onClose={vi.fn()} onFiles={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("muestra Fotos, Cámara y Archivos (sin Drive)", () => {
    render(<CorreoAttachSheet open onClose={vi.fn()} onFiles={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Adjuntar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Fotos/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Cámara/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Archivos/i })).toBeTruthy();
    expect(screen.queryByText(/Drive/i)).toBeNull();
  });

  it("al elegir archivos llama onFiles y cierra", () => {
    const onFiles = vi.fn();
    const onClose = vi.fn();
    render(<CorreoAttachSheet open onClose={onClose} onFiles={onFiles} />);
    const input = document.querySelector('input[accept="*/*"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    const file = new File(["x"], "doc.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [file] } });
    expect(onFiles).toHaveBeenCalledWith([file]);
    expect(onClose).toHaveBeenCalled();
  });
});
