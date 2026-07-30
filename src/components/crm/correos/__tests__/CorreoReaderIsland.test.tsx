/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { CorreoReaderIsland } from "../CorreoReaderIsland";
import {
  getUndoHostClaimSnapshot,
  __resetUndoSnackbarForTests,
} from "@/components/opai-ds/undo-snackbar-store";

vi.mock("@/lib/haptics", () => ({ triggerHaptic: vi.fn() }));
vi.mock("../correo-thread-action-client", () => ({ runCorreoAction: vi.fn() }));

const baseProps = {
  threadId: "t1",
  isUnread: false,
  archived: false,
  trashed: false,
  snoozedUntil: null,
  primaryAction: null,
  composerOpen: false,
  onCompose: vi.fn(),
  onSnoozeConfirm: vi.fn(),
  onOpenSnoozeSheet: vi.fn(),
  onRemove: vi.fn(),
  onDone: vi.fn(),
  onClose: vi.fn(),
};

describe("CorreoReaderIsland", () => {
  beforeEach(() => {
    __resetUndoSnackbarForTests();
  });

  it("renderiza exactamente 4 botones de acción, todos con aria-label", () => {
    const { container } = render(<CorreoReaderIsland {...baseProps} />);
    const actions = container.querySelectorAll("[data-island-action]");
    expect(actions).toHaveLength(4);
    actions.forEach((b) => expect(b.getAttribute("aria-label")).toBeTruthy());
  });

  it("primaria optimista = Responder mientras primaryAction es null", () => {
    render(<CorreoReaderIsland {...baseProps} />);
    expect(screen.getByRole("button", { name: "Responder" })).toBeTruthy();
  });

  it("hilo no-reply (forward) → primaria Reenviar", () => {
    render(
      <CorreoReaderIsland
        {...baseProps}
        primaryAction={{ mode: "forward", label: "Reenviar", canReply: false, replyAllAvailable: false }}
      />,
    );
    expect(screen.getByRole("button", { name: "Reenviar" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Responder" })).toBeNull();
  });

  it("con trashed el botón de eliminar cambia a restaurar", () => {
    render(<CorreoReaderIsland {...baseProps} trashed />);
    expect(screen.getByLabelText("Restaurar")).toBeTruthy();
    expect(screen.queryByLabelText("Eliminar")).toBeNull();
  });

  it("con snoozedUntil vigente el reloj queda activo (Dejar de posponer)", () => {
    const future = new Date(Date.now() + 3_600_000).toISOString();
    render(<CorreoReaderIsland {...baseProps} snoozedUntil={future} />);
    expect(screen.getByLabelText("Dejar de posponer")).toBeTruthy();
    expect(screen.queryByLabelText("Posponer")).toBeNull();
  });

  it("al montar reclama el host de undo y al desmontar lo libera", () => {
    const { unmount } = render(<CorreoReaderIsland {...baseProps} />);
    expect(getUndoHostClaimSnapshot()).toBe(true);
    unmount();
    expect(getUndoHostClaimSnapshot()).toBe(false);
  });

  it("composerOpen oculta la isla de acciones (exclusividad)", () => {
    const { container } = render(<CorreoReaderIsland {...baseProps} composerOpen />);
    expect(container.querySelectorAll("[data-island-action]")).toHaveLength(0);
  });
});
