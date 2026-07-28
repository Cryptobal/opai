import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  ComposerAiAssistToggle,
  ComposerAiPromptPill,
} from "../ComposerAiAssist";

describe("ComposerAiAssist", () => {
  it("el toggle reporta pressed cuando el panel está abierto", () => {
    const onToggle = vi.fn();
    render(<ComposerAiAssistToggle open onToggle={onToggle} />);
    const btn = screen.getByRole("button", { name: /cerrar asistente ia/i });
    expect(btn).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(btn);
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("Enter en la pill genera; la X cierra sin enviar mail", () => {
    const onGenerate = vi.fn();
    const onClose = vi.fn();
    const onChange = vi.fn();
    render(
      <ComposerAiPromptPill
        value="más breve"
        onChange={onChange}
        onGenerate={onGenerate}
        onRefine={() => {}}
        onClose={onClose}
        generating={false}
        hasDraft={false}
      />,
    );
    const input = screen.getByLabelText(/prompt para la ia/i);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onGenerate).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: /cerrar asistente ia/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("con borrador muestra chips de refinamiento", () => {
    const onRefine = vi.fn();
    render(
      <ComposerAiPromptPill
        value=""
        onChange={() => {}}
        onGenerate={() => {}}
        onRefine={onRefine}
        onClose={() => {}}
        generating={false}
        hasDraft
      />,
    );
    expect(screen.getByLabelText(/describir cambio/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Formalizar" }));
    fireEvent.click(screen.getByRole("button", { name: "Amistoso" }));
    fireEvent.click(screen.getByRole("button", { name: "Acortar" }));
    fireEvent.click(screen.getByRole("button", { name: "Pulir" }));
    expect(onRefine).toHaveBeenCalledTimes(4);
    expect(onRefine).toHaveBeenNthCalledWith(1, "formal");
    expect(onRefine).toHaveBeenNthCalledWith(2, "friendly");
    expect(onRefine).toHaveBeenNthCalledWith(3, "shorten");
    expect(onRefine).toHaveBeenNthCalledWith(4, "polish");
  });

  it("sin borrador no muestra chips; con borrador vacío deshabilita ↑", () => {
    const { rerender } = render(
      <ComposerAiPromptPill
        value=""
        onChange={() => {}}
        onGenerate={() => {}}
        onRefine={() => {}}
        onClose={() => {}}
        generating={false}
        hasDraft={false}
      />,
    );
    expect(screen.queryByRole("button", { name: "Formalizar" })).toBeNull();
    expect(screen.getByRole("button", { name: /generar borrador/i })).not.toBeDisabled();

    rerender(
      <ComposerAiPromptPill
        value=""
        onChange={() => {}}
        onGenerate={() => {}}
        onRefine={() => {}}
        onClose={() => {}}
        generating={false}
        hasDraft
      />,
    );
    expect(screen.getByRole("button", { name: /aplicar cambio/i })).toBeDisabled();
  });

  it("mientras genera, deshabilita el submit", () => {
    render(
      <ComposerAiPromptPill
        value="ok"
        onChange={() => {}}
        onGenerate={() => {}}
        onRefine={() => {}}
        onClose={() => {}}
        generating
        hasDraft={false}
      />,
    );
    expect(screen.getByRole("button", { name: /generando borrador/i })).toBeDisabled();
  });
});
