import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  ComposerAiAssistToggle,
  ComposerAiDraftSuggestion,
  ComposerAiPromptPill,
} from "../ComposerAiAssist";

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
});

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

  it("los presets viven en el kebab, no en el DOM inicial", () => {
    const onRefine = vi.fn();
    const onOpenStyle = vi.fn();
    render(
      <ComposerAiPromptPill
        value=""
        onChange={() => {}}
        onGenerate={() => {}}
        onRefine={onRefine}
        onClose={() => {}}
        generating={false}
        hasDraft
        onOpenStyle={onOpenStyle}
      />,
    );
    expect(screen.queryByRole("button", { name: "Formalizar" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /más opciones de ia/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Formalizar" }));
    fireEvent.click(screen.getByRole("button", { name: /más opciones de ia/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Amistoso" }));
    fireEvent.click(screen.getByRole("button", { name: /más opciones de ia/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Acortar" }));
    fireEvent.click(screen.getByRole("button", { name: /más opciones de ia/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Pulir" }));
    expect(onRefine).toHaveBeenCalledTimes(4);
    expect(onRefine).toHaveBeenNthCalledWith(1, "formal");
    expect(onRefine).toHaveBeenNthCalledWith(2, "friendly");
    expect(onRefine).toHaveBeenNthCalledWith(3, "shorten");
    expect(onRefine).toHaveBeenNthCalledWith(4, "polish");

    fireEvent.click(screen.getByRole("button", { name: /más opciones de ia/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /estilo de respuesta/i }));
    expect(onOpenStyle).toHaveBeenCalledOnce();
  });

  it("sin borrador deshabilita presets del kebab; con borrador vacío deshabilita ↑", () => {
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
    fireEvent.click(screen.getByRole("button", { name: /más opciones de ia/i }));
    expect(screen.getByRole("menuitem", { name: "Formalizar" })).toBeDisabled();
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

  it("la sugerencia del Radar ofrece Usar / Descartar sin auto-inyectar", () => {
    const onUse = vi.fn();
    const onDismiss = vi.fn();
    render(
      <ComposerAiDraftSuggestion
        draft="Hola, gracias por tu consulta sobre la cotización del servicio."
        onUse={onUse}
        onDismiss={onDismiss}
      />,
    );
    expect(screen.getByText(/radar tiene un borrador/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /usar este borrador/i }));
    expect(onUse).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: /descartar/i }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
