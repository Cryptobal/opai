import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CorreoReaderMobileHeader } from "../CorreoReaderMobileHeader";

vi.mock("../CorreoWorkContext", () => ({
  useCorreoWorkOptional: () => ({
    tasks: {
      data: [
        { id: "t1", title: "A", status: "open" },
        { id: "t2", title: "B", status: "done" },
      ],
      loading: false,
    },
  }),
}));

vi.mock("../CorreoReaderScrollContext", () => ({
  useCorreoReaderScroll: () => ({ scrolled: false }),
}));

describe("CorreoReaderMobileHeader — acciones", () => {
  afterEach(() => cleanup());

  it("muestra Copiloto y Tareas con badge de color; dispara callbacks", () => {
    const onOpenCopilot = vi.fn();
    const onOpenTasks = vi.fn();
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
          onOpenCopilot,
          copilotPending: true,
          onOpenTasks,
        }}
      />,
    );

    expect(screen.queryByRole("button", { name: "Destacar" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Copiloto" }));
    expect(onOpenCopilot).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /Tareas \(1 abierta\)/ }));
    expect(onOpenTasks).toHaveBeenCalledTimes(1);
    // Badge de color (punto), no contador numérico.
    expect(screen.queryByText("1")).toBeNull();
  });
});
