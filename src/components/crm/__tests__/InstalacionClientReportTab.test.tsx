import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { InstalacionClientReportTab } from "../InstalacionClientReportTab";

const configPayload = {
  success: true,
  data: {
    enabled: false,
    frequency: "weekly",
    weekday: 0,
    dayOfMonth: 1,
    sendHourChile: 8,
    includeAsistencia: true,
    includeCobertura: true,
    includeRondas: true,
    includeIncidentes: true,
    includeVisitas: true,
    lastSentAt: null,
    lastPeriodKey: null,
    canManage: true,
    installationName: "Asap - lampa",
    accountName: "Asap",
  },
};

describe("InstalacionClientReportTab", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:mock-preview"),
      revokeObjectURL: vi.fn(),
    });
  });

  it("muestra el formulario cuando la config carga", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/recipients")) {
          return new Response(JSON.stringify({ success: true, data: { contacts: [], extras: [] } }));
        }
        if (url.includes("/preview")) {
          return new Response(new Blob(["%PDF"], { type: "application/pdf" }));
        }
        return new Response(JSON.stringify(configPayload));
      })
    );

    render(<InstalacionClientReportTab installationId="inst-1" />);
    expect(await screen.findByText("Reporte cliente")).toBeTruthy();
    expect(screen.getByText("Envío automático")).toBeTruthy();
  });

  it("no se queda en spinner si la API falla", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ success: false, error: "Sin permisos" }), { status: 403 }))
    );

    render(<InstalacionClientReportTab installationId="inst-1" />);
    await waitFor(() => {
      expect(screen.getByText("No se pudo abrir el reporte")).toBeTruthy();
    });
    expect(screen.getByText("Sin permisos")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeTruthy();
  });
});
