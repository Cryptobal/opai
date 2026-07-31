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

  it("muestra Destacar y Tareas con badge; dispara callbacks", () => {
    const onToggleStar = vi.fn();
    const onOpenTasks = vi.fn();
    render(
      <CorreoReaderMobileHeader
        subject="Propuesta"
        onClose={() => {}}
        threadActions={{
          isUnread: false,
          archived: false,
          trashed: false,
          starred: false,
          onArchive: () => {},
          onTrash: () => {},
          onToggleRead: () => {},
          onToggleStar,
          onOpenTasks,
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Destacar" }));
    expect(onToggleStar).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Tareas" }));
    expect(onOpenTasks).toHaveBeenCalledTimes(1);
    expect(screen.getByText("1")).toBeTruthy();
  });
});
