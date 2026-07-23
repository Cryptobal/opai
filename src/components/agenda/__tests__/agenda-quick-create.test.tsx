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

/** El cuerpo del panel es de altura fija: cambiar modo/tipo no mueve el layout. */
function fixedBody(): HTMLElement {
  const node = document.querySelector<HTMLElement>('[role="dialog"] .h-\\[322px\\]');
  expect(node).not.toBeNull();
  return node!;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AgendaQuickCreate", () => {
  it("mantiene el cuerpo a altura fija al cambiar modo y tipo", () => {
    renderPanel();
    const body = fixedBody();
    expect(body.className).toContain("h-[322px]");

    // Cambiar tipo de evento no altera el contenedor fijo.
    fireEvent.click(screen.getByText("Técnica"));
    expect(fixedBody().className).toContain("h-[322px]");

    // Cambiar a Tarea tampoco (mismo alto reservado).
    fireEvent.click(screen.getByRole("button", { name: "tarea" }));
    expect(screen.getByText("Vence")).toBeInTheDocument();
    expect(fixedBody().className).toContain("h-[322px]");
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
