/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CorreoReaderSummary } from "../CorreoReaderSummary";

describe("CorreoReaderSummary — cache-first", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ summary: "- Punto nuevo", cached: false }),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("con caché vigente pinta la card y alternar Ocultar/Ver no llama a la API", async () => {
    render(
      <CorreoReaderSummary
        threadId="t1"
        initialSummary={{
          text: "- Cliente pide cotización\n- Falta respuesta",
          generatedAt: new Date().toISOString(),
          stale: false,
        }}
        messageCount={7}
      />,
    );

    expect(screen.getByText("Cliente pide cotización")).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Ocultar/ }));
    expect(screen.queryByText("Cliente pide cotización")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Ver resumen/ }));
    expect(screen.getByText("Cliente pide cotización")).toBeTruthy();

    expect(fetch).not.toHaveBeenCalled();
  });

  it("sin caché muestra el chip centrado y solo llama al tocarlo", async () => {
    const { container } = render(
      <CorreoReaderSummary threadId="t1" initialSummary={null} messageCount={3} />,
    );

    const chip = screen.getByRole("button", { name: /Resumir este correo/ });
    expect(container.querySelector(".my-3.flex.flex-col.items-center")).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();

    fireEvent.click(chip);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledWith(
      "/api/crm/correos/t1/summary",
      expect.objectContaining({ method: "POST" }),
    );
    await waitFor(() => expect(screen.getByText("Punto nuevo")).toBeTruthy());
  });

  it("Actualizar es la única llamada de una card ya pintada", async () => {
    render(
      <CorreoReaderSummary
        threadId="t1"
        initialSummary={{ text: "- Viejo", generatedAt: null, stale: true }}
        messageCount={2}
      />,
    );
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Actualizar/ }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText("Punto nuevo")).toBeTruthy());
  });
});
