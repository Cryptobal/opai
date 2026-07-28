import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { forwardRef, useEffect, useImperativeHandle } from "react";

const flushDraft = vi.fn(async () => {});
const discardDraft = vi.fn(async () => {});

vi.mock("../EmailComposer", () => {
  const EmailComposer = forwardRef(function MockComposer(
    {
      onDirtyChange,
      layout,
    }: {
      onDirtyChange?: (dirty: boolean) => void;
      layout?: string;
    },
    ref: React.Ref<{ flushDraft: () => Promise<void>; discardDraft: () => Promise<void> }>,
  ) {
    useEffect(() => {
      onDirtyChange?.(true);
    }, [onDirtyChange]);
    useImperativeHandle(ref, () => ({ flushDraft, discardDraft }), []);
    return <div data-testid="email-composer" data-layout={layout} />;
  });
  return { EmailComposer };
});

import { CorreoComposeSheet } from "../CorreoComposeSheet";

describe("CorreoComposeSheet", () => {
  beforeEach(() => {
    flushDraft.mockClear();
    discardDraft.mockClear();
  });

  it("usa layout sheet y permite minimizar en móvil", () => {
    render(<CorreoComposeSheet open onClose={vi.fn()} onSent={vi.fn()} />);
    expect(screen.getByTestId("email-composer")).toHaveAttribute("data-layout", "sheet");
    expect(screen.getByLabelText("Minimizar")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Minimizar"));
    expect(screen.getByLabelText("Restaurar")).toBeTruthy();
    expect(screen.getByTestId("email-composer").closest(".hidden")).toBeTruthy();
  });

  it("al cerrar con cambios pregunta guardar/descartar", async () => {
    const onClose = vi.fn();
    render(<CorreoComposeSheet open onClose={onClose} onSent={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("Cerrar"));
    expect(await screen.findByText("¿Guardar borrador?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Guardar borrador" }));
    await waitFor(() => {
      expect(flushDraft).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("descartar desde el diálogo elimina el borrador", async () => {
    const onClose = vi.fn();
    render(<CorreoComposeSheet open onClose={onClose} onSent={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("Cerrar"));
    fireEvent.click(await screen.findByRole("button", { name: "Descartar" }));
    await waitFor(() => {
      expect(discardDraft).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalled();
    });
  });
});
