/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CorreoReaderContextStrip } from "../CorreoReaderContextStrip";

const openTasks = vi.hoisted(() => [
  { id: "1", title: "Seguimiento", status: "open" },
  { id: "2", title: "Hecha", status: "done" },
]);

vi.mock("../CorreoWorkContext", () => ({
  useCorreoWorkOptional: () => ({
    tasks: { data: openTasks, loading: false },
  }),
}));

describe("CorreoReaderContextStrip", () => {
  afterEach(() => cleanup());

  it("muestra cuenta ancla y N tareas; abre sheets al tocar", () => {
    const onOpenAssociations = vi.fn();
    const onOpenTasks = vi.fn();
    render(
      <CorreoReaderContextStrip
        accountId="acc-1"
        accountName="Comtel Ltda"
        canEdit
        onOpenAssociations={onOpenAssociations}
        onOpenTasks={onOpenTasks}
        onSearchAccount={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Asociaciones: Comtel Ltda/ }));
    expect(onOpenAssociations).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /1 tarea abierta/ }));
    expect(onOpenTasks).toHaveBeenCalledTimes(1);
    expect(screen.getByText("1 tarea")).toBeTruthy();
  });
});
