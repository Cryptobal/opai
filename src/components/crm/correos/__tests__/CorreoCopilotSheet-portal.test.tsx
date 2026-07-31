import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CorreoCopilotSheet } from "../CorreoCopilotSheet";
import type { CorreoDetail } from "@/modules/crm/email/correos.types";

vi.mock("../useCorreoSuggestedAccounts", () => ({
  useCorreoSuggestedAccounts: () => [],
}));

vi.mock("../CorreoCopilotPending", () => ({
  CorreoCopilotPending: () => <div>pendientes</div>,
}));

vi.mock("../correo-copiloto-reasons", () => ({
  copilotoAttentionReasons: () => ["adjuntos sin guardar"],
}));

const detail = {
  thread: {
    id: "t1",
    subject: "Contrato",
    accountId: "a1",
    accountName: "Embajada De Suecia",
    dealId: null,
    dealTitle: null,
  },
  attachments: [{ id: "att1", savedFileId: null }],
  messages: [],
  degraded: false,
} as unknown as CorreoDetail;

describe("CorreoCopilotSheet portal", () => {
  beforeEach(() => {
    cleanup();
  });
  afterEach(() => cleanup());

  it("monta el dialog en document.body (fuera del lector con transform)", () => {
    const host = document.createElement("div");
    // Simula el containing block del lector (transform + overflow).
    host.style.transform = "translateX(0)";
    host.style.overflow = "hidden";
    document.body.appendChild(host);

    render(
      <CorreoCopilotSheet
        open
        detail={detail}
        canEdit
        onClose={vi.fn()}
        onAssociate={vi.fn()}
        onOpenPanel={vi.fn()}
        onComposeAi={vi.fn()}
      />,
      { container: host },
    );

    const dialog = screen.getByRole("dialog", { name: "Copiloto" });
    expect(dialog).toBeTruthy();
    expect(host.contains(dialog)).toBe(false);
    expect(document.body.contains(dialog)).toBe(true);

    host.remove();
  });
});
