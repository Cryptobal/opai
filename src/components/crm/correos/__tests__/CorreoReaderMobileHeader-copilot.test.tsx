import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CorreoReaderMobileHeader } from "../CorreoReaderMobileHeader";

describe("CorreoReaderMobileHeader — Copiloto", () => {
  afterEach(() => cleanup());

  it("el botón ✨ dispara onOpenCopilot (abre WorkPanel en CorreoDrawer)", () => {
    const onOpenCopilot = vi.fn();
    render(
      <CorreoReaderMobileHeader
        subject="Propuesta"
        onClose={() => {}}
        threadActions={{
          isUnread: false,
          archived: false,
          trashed: false,
          onArchive: () => {},
          onTrash: () => {},
          onToggleRead: () => {},
          copilotPending: true,
          onOpenCopilot,
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Copiloto" }));
    expect(onOpenCopilot).toHaveBeenCalledTimes(1);
  });
});
