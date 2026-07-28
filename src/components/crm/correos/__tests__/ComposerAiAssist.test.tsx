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
        onClose={onClose}
        generating={false}
      />,
    );
    const input = screen.getByLabelText(/prompt para la ia/i);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onGenerate).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: /cerrar asistente ia/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("mientras genera, deshabilita el submit", () => {
    render(
      <ComposerAiPromptPill
        value="ok"
        onChange={() => {}}
        onGenerate={() => {}}
        onClose={() => {}}
        generating
      />,
    );
    expect(screen.getByRole("button", { name: /generando borrador/i })).toBeDisabled();
  });
});
