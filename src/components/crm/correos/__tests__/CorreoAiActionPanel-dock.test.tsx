import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import {
  CORREO_COPILOT_DOCK_WIDTH_VAR,
  resetDockWidthClaims,
} from "../correo-copilot-dock";
import { CorreoAiActionPanel } from "../CorreoAiActionPanel";

vi.mock("../plan/usePlanDraft", () => ({
  usePlanDraft: () => ({
    proposal: null,
    include: {},
    locks: [],
    selectedIds: new Set<string>(),
    taskOverride: {},
    attachmentSelection: { storageKeys: [], target: "deal" },
    quoteInput: {},
    milestones: [],
    stagedFiles: [],
    draftSavedAt: null,
    dirty: false,
    setSelectedIds: vi.fn(),
    toggleAction: vi.fn(),
    setField: vi.fn(),
    setInclude: vi.fn(),
    setAssumptions: vi.fn(),
    setStagedFiles: vi.fn(),
    applyPreset: vi.fn(),
    resetToAi: vi.fn(),
    loadDraft: vi.fn(async () => null),
    clearDraft: vi.fn(async () => {}),
    setInstallationsAndRecalc: vi.fn(),
    setStaffingParam: vi.fn(),
  }),
}));

vi.mock("../LeadFromEmailPanel", () => ({
  LeadFromEmailPanel: () => <div>lead-panel</div>,
}));

vi.mock("../CorreoSourcePreview", () => ({
  CorreoSourcePreview: () => null,
}));

vi.mock("@/hooks/useKeyboardOffset", () => ({
  useKeyboardOffset: () => 0,
}));

vi.mock("@/components/chat/hooks/useSwipeGesture", () => ({
  useSwipeGesture: () => ({
    onTouchStart: vi.fn(),
    onTouchMove: vi.fn(),
    onTouchEnd: vi.fn(),
  }),
}));

describe("CorreoAiActionPanel dock", () => {
  beforeEach(() => {
    resetDockWidthClaims();
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
    resetDockWidthClaims();
  });

  it("abre como dock no-modal (sin aria-modal) y reserva ancho en desktop", () => {
    render(
      <CorreoAiActionPanel
        open
        threadId="thread-1"
        command="lead"
        threadLabel="Licitación · luis@coexpan.cl"
        onClose={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Crear lead con IA" });
    expect(dialog.getAttribute("aria-modal")).toBe("false");
    expect(screen.getByText(/Anclado a · Licitación/)).toBeTruthy();
    expect(
      document.documentElement.style.getPropertyValue(CORREO_COPILOT_DOCK_WIDTH_VAR),
    ).toMatch(/px$/);
  });

  it("libera el carril al cerrarse (sin claims no queda ancho reservado)", () => {
    const { unmount } = render(
      <CorreoAiActionPanel
        open
        threadId="thread-1"
        command="lead"
        onClose={vi.fn()}
      />,
    );
    expect(
      document.documentElement.style.getPropertyValue(CORREO_COPILOT_DOCK_WIDTH_VAR),
    ).toMatch(/px$/);

    unmount();
    expect(
      document.documentElement.style.getPropertyValue(CORREO_COPILOT_DOCK_WIDTH_VAR),
    ).toBe("");
  });
});
