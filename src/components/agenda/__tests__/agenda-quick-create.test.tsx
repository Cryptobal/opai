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
  it("cambia entre modo Evento y Tarea y entre tipos", () => {
    renderPanel();

    // Cuerpo con scroll vertical contenido (sin caja fija legacy).
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

  // jsdom no calcula layout real: los asserts de clase son el contrato de
  // regresión contra desborde horizontal y corte del footer. No borrar.
  it("contiene el panel al viewport sin scroll horizontal", () => {
    renderPanel();

    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("max-h-[calc(100dvh-16px)]");
    expect(dialog.className).toContain("overflow-hidden");
    expect(dialog.className).toContain("w-[min(400px,calc(100vw-16px))]");

    const body = dialog.querySelector<HTMLElement>(".overflow-y-auto");
    expect(body).not.toBeNull();
    expect(body!.className).toContain("min-h-0");
    expect(body!.className).toContain("flex-1");
    expect(body!.className).toContain("overflow-y-auto");
    expect(body!.className).toContain("overflow-x-hidden");
    expect(body!.className).not.toContain("max-h-[calc(100dvh-8rem)]");
  });

  it("la fila Tipo envuelve chips y Reunión es clicable", () => {
    renderPanel();

    const reunion = screen.getByRole("button", { name: "Reunión" });
    const tipoRow = reunion.parentElement;
    expect(tipoRow).not.toBeNull();
    expect(tipoRow!.className).toContain("flex-wrap");
    expect(tipoRow!.className).toContain("min-h-9");
    // Altura fija h-9 (token exacto) recortaría la 2.ª línea al envolver.
    expect(tipoRow!.className.split(/\s+/)).not.toContain("h-9");

    for (const label of ["Cliente", "Técnica", "Supervisión", "Reunión"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }

    fireEvent.click(reunion);
    // Chip activo usa bg-primary; los demás usan bg-ds-surface-2.
    expect(reunion.className).toContain("bg-primary");
  });

  it("la fila Vence del modo Tarea usa chips canónicos", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "tarea" }));

    expect(screen.getByLabelText("Vencimiento")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hoy" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Fecha y hora|·/ })).toBeInTheDocument();
    expect(screen.getByLabelText("Notas de la tarea")).toBeInTheDocument();
  });

  it("prefija fecha y hora del slot clickeado en modo Evento", () => {
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

    const { onCreated } = renderPanel();
    const title = screen.getByLabelText("Título");

    fireEvent.keyDown(title, { key: "Tab" });
    expect(screen.getByText("Vence")).toBeInTheDocument();

    fireEvent.change(title, { target: { value: "Llamar al cliente" } });
    fireEvent.keyDown(title, { key: "Enter" });

    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    // Tras crear, ofrece "Abrir detalle" en vez de cerrar de inmediato.
    expect(screen.getByRole("button", { name: "Abrir detalle" })).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/crm/tasks");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.title).toBe("Llamar al cliente");
    expect(body.allDay).toBe(false);
  });

  it("modo Tarea envía assigneeIds (sin assignedTo) y notas", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { id: "t1" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { onCreated } = renderPanel();
    const title = screen.getByLabelText("Título");
    fireEvent.keyDown(title, { key: "Tab" }); // → modo Tarea

    fireEvent.change(screen.getByLabelText("Notas de la tarea"), {
      target: { value: "Llevar contrato" },
    });
    fireEvent.change(title, { target: { value: "Revisar propuesta" } });
    fireEvent.keyDown(title, { key: "Enter" });

    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).not.toHaveProperty("assignedTo");
    expect(body.assigneeIds).toBeUndefined();
    expect(body.notes).toBe("Llevar contrato");
  });

  it("Esc cierra el panel", () => {
    const { onClose } = renderPanel();
    fireEvent.keyDown(screen.getByLabelText("Título"), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
