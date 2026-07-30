import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CORREO_COPILOT_DOCK_WIDTH_VAR } from "../correo-copilot-dock";
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
    document.documentElement.style.removeProperty(CORREO_COPILOT_DOCK_WIDTH_VAR);
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        matches: query.includes("min-width: 1024px"),
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
    document.documentElement.style.removeProperty(CORREO_COPILOT_DOCK_WIDTH_VAR);
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
    // Scrim mobile existe pero oculto en lg; no hay wrapper inset-0 con bg-black/40 desktop.
    expect(dialog.className).toContain("lg:right-0");
    expect(
      document.documentElement.style.getPropertyValue(CORREO_COPILOT_DOCK_WIDTH_VAR),
    ).toBe("430px");
  });
});
