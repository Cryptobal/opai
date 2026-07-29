/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CorreoSystemLabels } from "../CorreoSystemLabels";

const runCorreoAction = vi.fn().mockResolvedValue(true);

vi.mock("../correo-thread-action-client", () => ({
  runCorreoAction: (...args: unknown[]) => runCorreoAction(...args),
}));

describe("CorreoSystemLabels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("no renderiza nada sin papelera ni posponer", () => {
    const { container } = render(
      <CorreoSystemLabels
        threadId="t1"
        trashedAt={null}
        snoozedUntil={null}
        canModify
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("muestra chip Papelera y restaura al quitar la etiqueta", async () => {
    const onRemove = vi.fn();
    render(
      <CorreoSystemLabels
        threadId="t1"
        trashedAt="2026-07-29T12:00:00.000Z"
        snoozedUntil={null}
        canModify
        onRemove={onRemove}
      />,
    );
    expect(screen.getByText("Papelera")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Quitar de la Papelera"));
    expect(onRemove).toHaveBeenCalledWith("t1");
    await waitFor(() =>
      expect(runCorreoAction).toHaveBeenCalledWith(
        "t1",
        "untrash",
        "Restaurado a bandeja",
        undefined,
        undefined,
        undefined,
      ),
    );
  });

  it("muestra Dejar de posponer y ejecuta unsnooze", async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const onRemove = vi.fn();
    render(
      <CorreoSystemLabels
        threadId="t2"
        trashedAt={null}
        snoozedUntil={future}
        canModify
        onRemove={onRemove}
      />,
    );
    expect(screen.getByText(/Pospuesto hasta/)).toBeTruthy();
    fireEvent.click(screen.getByText("Dejar de posponer"));
    expect(onRemove).toHaveBeenCalledWith("t2");
    await waitFor(() =>
      expect(runCorreoAction).toHaveBeenCalledWith(
        "t2",
        "unsnooze",
        "Dejado de posponer",
        undefined,
        undefined,
        undefined,
      ),
    );
  });

  it("no muestra Dejar de posponer si el snooze ya venció", () => {
    const past = new Date(Date.now() - 60 * 1000).toISOString();
    const { container } = render(
      <CorreoSystemLabels
        threadId="t3"
        trashedAt={null}
        snoozedUntil={past}
        canModify
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});
