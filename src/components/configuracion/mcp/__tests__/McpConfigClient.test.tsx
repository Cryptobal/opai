import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { McpConfigClient } from "../McpConfigClient";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const ACTIVE: {
  id: string;
  name: string;
  keyPrefix: string;
  scope: "READ";
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
} = {
  id: "k-active",
  name: "Cursor",
  keyPrefix: "opai_mcp_Ab",
  scope: "READ",
  lastUsedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  revokedAt: null,
};

const REVOKED = {
  ...ACTIVE,
  id: "k-revoked",
  name: "Vieja",
  revokedAt: "2026-02-01T00:00:00.000Z",
};

const VALID_KEY = `opai_mcp_${"A".repeat(40)}`;

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, keys: [ACTIVE, REVOKED] }),
    }),
  );
});

describe("McpConfigClient", () => {
  it("no ofrece copiar snippets hasta pegar una key con formato válido", async () => {
    render(<McpConfigClient baseUrl="https://www.opai.cl" />);
    await waitFor(() => expect(screen.getByText("Conectar")).toBeTruthy());

    expect(screen.getAllByText(/TU_API_KEY/).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Copiar" })).toBeNull();
    expect(screen.getByRole("button", { name: /probar conexión/i })).toBeDisabled();

    const input = screen.getByLabelText(/pega tu api key/i);
    fireEvent.change(input, { target: { value: "TU_API_KEY" } });
    expect(screen.getByText(/debe empezar con opai_mcp_/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Copiar" })).toBeNull();

    fireEvent.change(input, { target: { value: `https://www.opai.cl/api/mcp/${VALID_KEY}` } });
    expect(screen.getByText(/pega solo la api key/i)).toBeTruthy();

    fireEvent.change(input, { target: { value: VALID_KEY } });
    await waitFor(() => {
      expect(screen.getByText(new RegExp(`/api/mcp/${VALID_KEY}`))).toBeTruthy();
    });
    expect(screen.queryByText(/TU_API_KEY/)).toBeNull();
    expect(screen.getAllByRole("button", { name: "Copiar" }).length).toBe(4);
    expect(screen.getByRole("button", { name: /probar conexión/i })).toBeEnabled();
  });

  it("muestra Revocar en keys activas y Eliminar en revocadas", async () => {
    render(<McpConfigClient baseUrl="https://www.opai.cl" />);
    await waitFor(() => expect(screen.getByText("Cursor")).toBeTruthy());
    expect(screen.getByRole("button", { name: /revocar/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /eliminar/i })).toBeTruthy();
  });

  it("Probar conexión reporta el número de tools en éxito y el mensaje del servidor en error", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/integrations/mcp/keys") && (!init || !init.method || init.method === "GET")) {
        return { ok: true, json: async () => ({ success: true, keys: [ACTIVE, REVOKED] }) };
      }
      if (url === "https://www.opai.cl/api/mcp") {
        const auth = (init?.headers as Record<string, string> | undefined)?.Authorization;
        if (auth === `Bearer ${VALID_KEY}`) {
          return {
            ok: true,
            json: async () => ({ jsonrpc: "2.0", id: 1, result: { tools: [{ name: "a" }, { name: "b" }] } }),
          };
        }
        return {
          ok: false,
          status: 401,
          json: async () => ({ error: "invalid_api_key", message: "API key inválida o revocada." }),
        };
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<McpConfigClient baseUrl="https://www.opai.cl" />);
    await waitFor(() => expect(screen.getByText("Conectar")).toBeTruthy());
    const input = screen.getByLabelText(/pega tu api key/i);
    fireEvent.change(input, { target: { value: VALID_KEY } });
    fireEvent.click(screen.getByRole("button", { name: /probar conexión/i }));
    await waitFor(() => expect(screen.getByText(/2 tools disponibles/i)).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledWith(
      "https://www.opai.cl/api/mcp",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: `Bearer ${VALID_KEY}` }),
      }),
    );

    const revokedKey = `opai_mcp_${"B".repeat(40)}`;
    fireEvent.change(input, { target: { value: revokedKey } });
    fireEvent.click(screen.getByRole("button", { name: /probar conexión/i }));
    await waitFor(() => expect(screen.getByText(/API key inválida o revocada/i)).toBeTruthy());
  });

  it("Eliminar llama DELETE con permanent=true", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "DELETE") {
        return { ok: true, json: async () => ({ success: true }) };
      }
      if (url.includes("/api/integrations/mcp/keys")) {
        return { ok: true, json: async () => ({ success: true, keys: [ACTIVE, REVOKED] }) };
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<McpConfigClient baseUrl="https://www.opai.cl" />);
    await waitFor(() => expect(screen.getByText("Vieja")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /eliminar/i }));
    await waitFor(() => expect(screen.getByText(/se borrará el registro de forma permanente/i)).toBeTruthy());
    const confirm = screen.getAllByRole("button", { name: "Eliminar" }).at(-1);
    fireEvent.click(confirm!);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/integrations/mcp/keys?id=k-revoked&permanent=true",
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });
});
