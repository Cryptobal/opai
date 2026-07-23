import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecentEmailCard } from "../RecentEmailCard";
import { HubEmailProvider } from "../hub-email-context";
import type { HubRecentEmails, HubEmailItem } from "@/modules/crm/email/hub-recent-emails";

function item(overrides: Partial<HubEmailItem> & { id: string }): HubEmailItem {
  return {
    subject: `Asunto ${overrides.id}`,
    fromEmail: "cliente@example.com",
    snippet: "Extracto breve",
    lastMessageAt: "2026-07-22T12:00:00.000Z",
    isUnread: false,
    hasAttachment: false,
    accountEmail: "yo@empresa.cl",
    ...overrides,
  };
}

function payload(overrides: Partial<HubRecentEmails> = {}): HubRecentEmails {
  return {
    connected: true,
    accountEmails: ["yo@empresa.cl"],
    unreadCount: 2,
    items: [item({ id: "t1", isUnread: true }), item({ id: "t2" })],
    ...overrides,
  };
}

function mockFetchOnce(json: unknown, ok = true) {
  const fn = vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: async () => json,
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

function renderCard() {
  return render(
    <HubEmailProvider>
      <RecentEmailCard />
    </HubEmailProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("RecentEmailCard", () => {
  it("hace UNA sola llamada GET de solo lectura (no marca como leído)", async () => {
    const fetchMock = mockFetchOnce(payload());
    renderCard();
    await waitFor(() => expect(screen.getByText("Asunto t1")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/hub/emails");
    // Sin init/method → GET puro; renderizar jamás muta isUnread.
    expect(init?.method ?? "GET").toBe("GET");
  });

  it("cada fila deep-linkea al hilo con el mecanismo existente", async () => {
    mockFetchOnce(payload());
    const { container } = renderCard();
    await waitFor(() => expect(screen.getByText("Asunto t1")).toBeTruthy());
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) =>
      a.getAttribute("href"),
    );
    expect(hrefs).toContain("/crm/correos?thread=t1");
    expect(hrefs).toContain("/crm/correos?thread=t2");
    expect(hrefs).toContain("/crm/correos"); // Ver todos
  });

  it("muestra 3 filas en móvil y hasta 5 en desktop (clases responsive)", async () => {
    mockFetchOnce(
      payload({
        items: ["a", "b", "c", "d", "e"].map((id) => item({ id })),
      }),
    );
    const { container } = renderCard();
    await waitFor(() => expect(screen.getByText("Asunto a")).toBeTruthy());
    const rows = Array.from(container.querySelectorAll("li"));
    expect(rows).toHaveLength(5);
    expect(rows[2].className).not.toContain("hidden");
    expect(rows[3].className).toContain("hidden lg:block");
    expect(rows[4].className).toContain("hidden lg:block");
  });

  it("muestra el conteo de no leídos y el indicador visual", async () => {
    mockFetchOnce(payload({ unreadCount: 4 }));
    renderCard();
    // El badge vive en el header móvil y en el desktop (visibilidad por CSS).
    await waitFor(() =>
      expect(screen.getAllByText("4 sin leer").length).toBeGreaterThanOrEqual(1),
    );
    expect(screen.getByLabelText("No leído")).toBeTruthy();
  });

  it("identifica la casilla de origen solo cuando hay más de una", async () => {
    mockFetchOnce(
      payload({
        accountEmails: ["yo@empresa.cl", "ventas@empresa.cl"],
        items: [item({ id: "t1", accountEmail: "ventas@empresa.cl" })],
      }),
    );
    renderCard();
    await waitFor(() =>
      expect(screen.getByText("ventas@empresa.cl")).toBeTruthy(),
    );
  });

  it("estado vacío: 'Tu bandeja está al día'", async () => {
    mockFetchOnce(payload({ items: [], unreadCount: 0 }));
    renderCard();
    await waitFor(() =>
      expect(screen.getByText("Tu bandeja está al día")).toBeTruthy(),
    );
  });

  it("sin casilla conectada ofrece 'Conectar Gmail'", async () => {
    mockFetchOnce({
      connected: false,
      accountEmails: [],
      unreadCount: 0,
      items: [],
    });
    renderCard();
    await waitFor(() => expect(screen.getByText("Conectar Gmail")).toBeTruthy());
    expect(
      screen.getByText("Conectar Gmail").closest("a")?.getAttribute("href"),
    ).toBe("/opai/configuracion/integraciones");
  });

  it("estado degradado: aviso discreto con Reintentar que reintenta el fetch", async () => {
    const fetchMock = mockFetchOnce(null, false);
    renderCard();
    await waitFor(() => expect(screen.getByText("Reintentar")).toBeTruthy());
    expect(screen.getByText("No pudimos cargar tus correos.")).toBeTruthy();
    screen.getByText("Reintentar").closest("button")!.click();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
