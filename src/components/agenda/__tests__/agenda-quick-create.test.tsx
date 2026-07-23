import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgendaQuickCreate } from "../desktop/AgendaQuickCreate";

const USERS = [{ id: "u1", name: "Ana Rojas" }];

function renderPanel(onClose = vi.fn(), onCreated = vi.fn()) {
  render(
    <AgendaQuickCreate
      state={{ mode: "evento", origin: { x: 300, y: 200 }, dateKey: "2026-07-23", minute: 600 }}
      users={USERS}
      onClose={onClose}
      onCreated={onCreated}
    />,
  );
  return { onClose, onCreated };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AgendaQuickCreate", () => {
  it("cambia entre modo Evento y Tarea y entre tipos sin scroll interno", () => {
    renderPanel();

    // Cuerpo de altura natural (sin caja fija con scroll interno).
    const body = document.querySelector<HTMLElement>('[role="dialog"] .overflow-y-auto');
    expect(body).not.toBeNull();
    expect(body!.className).not.toContain("h-[322px]");

    // Cambiar tipo de evento intercambia sólo el contenido de la fila.
    fireEvent.click(screen.getByText("Técnica"));
    expect(screen.getByText("Participantes")).toBeInTheDocument();

    // Cambiar a Tarea muestra los campos de tarea.
    fireEvent.click(screen.getByRole("button", { name: "tarea" }));
    expect(screen.getByText("Vence")).toBeInTheDocument();
  });

  it("prefija fecha y hora del slot clickeado", () => {
    renderPanel();
    expect(screen.getByLabelText("Fecha")).toHaveValue("2026-07-23");
    expect(screen.getByLabelText("Hora")).toHaveValue("10:00");
  });

  it("Tab en el título alterna Evento/Tarea y Enter guarda la tarea", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { id: "t1" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { onClose, onCreated } = renderPanel();
    const title = screen.getByLabelText("Título");

    fireEvent.keyDown(title, { key: "Tab" });
    expect(screen.getByText("Vence")).toBeInTheDocument();

    fireEvent.change(title, { target: { value: "Llamar al cliente" } });
    fireEvent.keyDown(title, { key: "Enter" });

    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/crm/tasks");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.title).toBe("Llamar al cliente");
    expect(body.allDay).toBe(false);
  });

  it("Esc cierra el panel", () => {
    const { onClose } = renderPanel();
    fireEvent.keyDown(screen.getByLabelText("Título"), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
