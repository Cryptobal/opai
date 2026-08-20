/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { AccessControlExit } from "../AccessControlExit";
import type { AccessControlConfigData } from "@/lib/access-control/types";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const authFetch = vi.fn();
vi.mock("@/app/portal/acceso/_lib/authFetch", () => ({
  authFetch: (...args: unknown[]) => authFetch(...args),
}));

const config: AccessControlConfigData = {
  installationId: "inst-1",
  enabledRecordTypes: ["staff"],
  useWhitelist: false,
  useBlacklist: false,
  requireIdValidation: false,
  requirePhoto: false,
  requireSignature: false,
  maxStayHours: null,
  autoReportSchedule: null,
  formConfig: {},
};

const inSitePayload = {
  success: true,
  data: {
    records: [
      {
        id: "rec-1",
        recordType: "staff",
        rut: "141700618",
        fullName: "Roberto Zuñiga",
        company: null,
        entryAt: new Date().toISOString(),
        vehiclePlate: null,
      },
    ],
    personCount: 1,
    vehicleCount: 0,
  },
};

describe("AccessControlExit", () => {
  beforeEach(() => {
    authFetch.mockReset();
  });

  it("pide la lista en sitio con el deviceToken del celular", async () => {
    authFetch.mockResolvedValue({
      ok: true,
      json: async () => inSitePayload,
    });

    await act(async () => {
      render(
        <AccessControlExit
          installationId="97c89ca9-45b5-46c3-b1f1-2a0fb2811498"
          guardId="guard-1"
          config={config}
          deviceToken="device-token-abc"
          onClose={() => {}}
        />,
      );
    });

    await waitFor(() => {
      expect(authFetch).toHaveBeenCalled();
    });

    const [url, , token] = authFetch.mock.calls[0];
    expect(String(url)).toContain(
      "/api/access-control/records/97c89ca9-45b5-46c3-b1f1-2a0fb2811498/in-site",
    );
    expect(token).toBe("device-token-abc");
    expect(await screen.findByText("Roberto Zuñiga")).toBeTruthy();
  });

  it("no finge lista vacía cuando el token falta y la API responde 401", async () => {
    authFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ success: false, error: "No autorizado" }),
    });

    await act(async () => {
      render(
        <AccessControlExit
          installationId="inst-1"
          guardId="guard-1"
          config={config}
          onClose={() => {}}
        />,
      );
    });

    expect(
      await screen.findByText(/Vuelve a emparejar el dispositivo/i),
    ).toBeTruthy();
    expect(screen.queryByText("No hay personas en sitio")).toBeNull();
  });
});
