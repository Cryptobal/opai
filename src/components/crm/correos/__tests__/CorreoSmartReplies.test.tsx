/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CorreoSmartReplies } from "../CorreoSmartReplies";

const intents = [
  { id: "intent-1", label: "Confirmar reunión", hint: "proponer horario esta semana" },
  { id: "intent-2", label: "Pedir dotación", hint: "cuántos guardias por turno" },
  { id: "intent-3", label: "Enviar cotización", hint: "adjuntar propuesta vigente" },
];

describe("CorreoSmartReplies", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ intents, cached: false }),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("arranca con un solo chip y no llama a la API al montar", () => {
    render(
      <CorreoSmartReplies
        threadId="t1"
        composerOpen={false}
        variant="inline"
        onCompose={() => {}}
      />,
    );
    const trigger = screen.getByRole("button", { name: /Sugerir respuestas/ });
    expect(trigger).toBeTruthy();
    expect(trigger.textContent).toMatch(/con contexto del hilo/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("al tocarlo pide las intenciones y muestra 3 chips + Desde cero", async () => {
    render(
      <CorreoSmartReplies
        threadId="t1"
        composerOpen={false}
        variant="inline"
        onCompose={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Sugerir respuestas/ }));

    await waitFor(() => expect(screen.getByText("Confirmar reunión")).toBeTruthy());
    expect(fetch).toHaveBeenCalledWith(
      "/api/crm/correos/t1/reply-intents",
      expect.objectContaining({ method: "POST" }),
    );
    expect(screen.getByText("Pedir dotación")).toBeTruthy();
    expect(screen.getByText("Enviar cotización")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Desde cero/ })).toBeTruthy();
  });

  it("tocar una intención abre el composer con label + hint como instrucciones", async () => {
    const onCompose = vi.fn();
    render(
      <CorreoSmartReplies
        threadId="t1"
        composerOpen={false}
        variant="inline"
        onCompose={onCompose}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Sugerir respuestas/ }));
    await waitFor(() => expect(screen.getByText("Confirmar reunión")).toBeTruthy());

    fireEvent.click(screen.getByText("Confirmar reunión"));
    expect(onCompose).toHaveBeenCalledWith({
      instructions: "Confirmar reunión. proponer horario esta semana",
    });

    fireEvent.click(screen.getByRole("button", { name: /Desde cero/ }));
    expect(onCompose).toHaveBeenLastCalledWith({ ai: true });
  });

  it("con el composer abierto no renderiza nada", () => {
    const { container } = render(
      <CorreoSmartReplies
        threadId="t1"
        composerOpen
        variant="inline"
        onCompose={() => {}}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("variante dock sin host del shell no renderiza inline", () => {
    const { container } = render(
      <CorreoSmartReplies threadId="t1" composerOpen={false} onCompose={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
