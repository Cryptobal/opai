import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import {
  CORREO_COPILOT_DOCK_WIDTH_VAR,
  COPILOT_DOCK_DESKTOP_MQ,
  DOCK_CLAIM_PLAN,
  claimDockWidth,
  resetDockWidthClaims,
} from "../correo-copilot-dock";
import { CorreoWorkPanel } from "../CorreoWorkPanel";
import type { CorreoDetail } from "@/modules/crm/email/correos.types";

vi.mock("@/hooks/useEffectivePermissions", () => ({
  useEffectivePermissions: () => ({
    modules: { crm: "full", ops: "full" },
    capabilities: { copiloto_correos: true },
  }),
}));

vi.mock("@/lib/permissions", () => ({
  hasModuleAccess: () => true,
  canEdit: () => true,
  hasCapability: () => true,
}));

vi.mock("@/components/chat/hooks/useSwipeGesture", () => ({
  useSwipeGesture: () => ({
    onTouchStart: vi.fn(),
    onTouchMove: vi.fn(),
    onTouchEnd: vi.fn(),
  }),
}));

vi.mock("../CorreoWorkSummary", () => ({
  CorreoWorkSummary: () => <div>summary</div>,
}));

vi.mock("../CorreoMeetingPanel", () => ({ CorreoMeetingPanel: () => null }));
vi.mock("../CorreoTicketPanel", () => ({ CorreoTicketPanel: () => null }));
vi.mock("../CorreoTasksPanel", () => ({ CorreoTasksPanel: () => null }));
vi.mock("../CorreoAttachments", () => ({ CorreoAttachments: () => null }));

const detail = {
  thread: {
    id: "t1",
    subject: "Licitación",
    accountId: "a1",
    accountName: "Coexpan",
    dealId: null,
    dealTitle: null,
  },
  attachments: [],
  messages: [],
  degraded: false,
} as unknown as CorreoDetail;

describe("CorreoWorkPanel dock", () => {
  beforeEach(() => {
    resetDockWidthClaims();
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        matches: query === COPILOT_DOCK_DESKTOP_MQ,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    });
  });

  afterEach(() => {
    cleanup();
    resetDockWidthClaims();
  });

  it("abre como dock no-modal sin scrim desktop y reserva ancho", () => {
    render(
      <CorreoWorkPanel
        open
        initialTab="contexto"
        detail={detail}
        onClose={vi.fn()}
        onOpenAiLead={vi.fn()}
        onAssociate={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Copiloto" });
    expect(dialog.getAttribute("aria-modal")).toBe("false");
    expect(dialog.className).toContain("right-0");
    expect(
      document.documentElement.style.getPropertyValue(CORREO_COPILOT_DOCK_WIDTH_VAR),
    ).toBe("430px");
  });

  it("cede el carril al Plan: un claim posterior gana y al soltarlo vuelve el Copiloto", () => {
    const { unmount } = render(
      <CorreoWorkPanel
        open
        initialTab="contexto"
        detail={detail}
        onClose={vi.fn()}
        onOpenAiLead={vi.fn()}
        onAssociate={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );

    // El Plan reclama después → gana su ancho aunque Copiloto siga montado.
    claimDockWidth(DOCK_CLAIM_PLAN, 520);
    expect(
      document.documentElement.style.getPropertyValue(CORREO_COPILOT_DOCK_WIDTH_VAR),
    ).toBe("520px");

    // Al cerrarse el Copiloto su release NO borra la var reclamada por el Plan.
    unmount();
    expect(
      document.documentElement.style.getPropertyValue(CORREO_COPILOT_DOCK_WIDTH_VAR),
    ).toBe("520px");
  });

  it("en iPad (touch) abre como sheet con scrim y sin reservar ancho", () => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    });

    const { container: _container } = render(
      <CorreoWorkPanel
        open
        initialTab="contexto"
        detail={detail}
        onClose={vi.fn()}
        onOpenAiLead={vi.fn()}
        onAssociate={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Copiloto" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.className).toContain("rounded-t-2xl");
    expect(document.body.querySelector(".bg-black\\/40")).toBeTruthy();
    expect(
      document.documentElement.style.getPropertyValue(CORREO_COPILOT_DOCK_WIDTH_VAR),
    ).toBe("");
  });
});
