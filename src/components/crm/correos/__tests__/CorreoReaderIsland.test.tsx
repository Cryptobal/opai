/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CorreoReaderIsland } from "../CorreoReaderIsland";
import {
  getUndoHostClaimSnapshot,
  __resetUndoSnackbarForTests,
} from "@/components/opai-ds/undo-snackbar-store";

const baseProps = {
  primaryAction: null as null,
  composerOpen: false,
  onCompose: vi.fn(),
};

describe("CorreoReaderIsland", () => {
  beforeEach(() => {
    __resetUndoSnackbarForTests();
    baseProps.onCompose = vi.fn();
  });

  it("barra con Responder y Reenviar (optimista mientras primaryAction es null)", () => {
    const { container } = render(<CorreoReaderIsland {...baseProps} />);
    const actions = container.querySelectorAll("[data-island-action]");
    expect(actions).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Responder" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reenviar" })).toBeTruthy();
  });

  it("muestra A todos cuando replyAllAvailable", () => {
    render(
      <CorreoReaderIsland
        {...baseProps}
        primaryAction={{
          mode: "reply",
          label: "Responder",
          canReply: true,
          replyAllAvailable: true,
        }}
      />,
    );
    expect(screen.getByRole("button", { name: "Responder a todos" })).toBeTruthy();
    expect(
      document.querySelectorAll("[data-island-action]"),
    ).toHaveLength(3);
  });

  it("no-reply: Responder deshabilitado y Reenviar es primaria", () => {
    render(
      <CorreoReaderIsland
        {...baseProps}
        primaryAction={{
          mode: "forward",
          label: "Reenviar",
          canReply: false,
          replyAllAvailable: false,
        }}
      />,
    );
    const reply = screen.getByRole("button", { name: "Responder (no-reply)" });
    expect(reply).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reenviar" })).toBeTruthy();
  });

  it("toca Responder/Reenviar dispara onCompose directo (sin sheet)", () => {
    const onCompose = vi.fn();
    render(
      <CorreoReaderIsland
        {...baseProps}
        onCompose={onCompose}
        primaryAction={{
          mode: "reply",
          label: "Responder",
          canReply: true,
          replyAllAvailable: true,
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Responder" }));
    fireEvent.click(screen.getByRole("button", { name: "Responder a todos" }));
    fireEvent.click(screen.getByRole("button", { name: "Reenviar" }));
    expect(onCompose).toHaveBeenCalledWith("reply");
    expect(onCompose).toHaveBeenCalledWith("all");
    expect(onCompose).toHaveBeenCalledWith("forward");
  });

  it("al montar reclama el host de undo y al desmontar lo libera", () => {
    const { unmount } = render(<CorreoReaderIsland {...baseProps} />);
    expect(getUndoHostClaimSnapshot()).toBe(true);
    unmount();
    expect(getUndoHostClaimSnapshot()).toBe(false);
  });

  it("composerOpen oculta la barra de respuesta (exclusividad)", () => {
    const { container } = render(<CorreoReaderIsland {...baseProps} composerOpen />);
    expect(container.querySelectorAll("[data-island-action]")).toHaveLength(0);
  });

  it("topSlot vive dentro de la misma cápsula glass", () => {
    const { container } = render(
      <CorreoReaderIsland
        {...baseProps}
        topSlot={<button type="button">Sugerir respuestas</button>}
      />,
    );
    const smart = container.querySelector("[data-island-smart-replies]");
    expect(smart).toBeTruthy();
    expect(smart?.textContent).toContain("Sugerir respuestas");
    // Misma cápsula: el slot y las acciones comparten el shell glass.
    const shell = smart?.parentElement;
    expect(shell?.querySelectorAll("[data-island-action]").length).toBeGreaterThan(0);
  });
});

