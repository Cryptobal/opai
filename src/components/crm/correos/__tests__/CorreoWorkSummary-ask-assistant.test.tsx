/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { CorreoDetail } from "@/modules/crm/email/correos.types";

const dispatchAiCommand = vi.fn();

vi.mock("@/hooks/useEffectivePermissions", () => ({
  useEffectivePermissions: () => ({
    modules: { productividad: "full" },
    submodules: { "productividad.correos": "full" },
    capabilities: { copiloto_correos: true },
  }),
}));

vi.mock("@/lib/ai/ai-command-event", () => ({
  dispatchAiCommand: (...args: unknown[]) => dispatchAiCommand(...args),
}));

vi.mock("../CorreoContextCascade", () => ({
  CorreoContextCascade: () => <div data-testid="cascade" />,
}));

vi.mock("../CorreoThreadSummaryCard", () => ({
  CorreoThreadSummaryCard: () => <div data-testid="thread-summary" />,
}));

import { CorreoWorkSummary } from "../CorreoWorkSummary";

function detailFixture(subject = "Propuesta de servicio"): CorreoDetail {
  return {
    thread: {
      id: "thr_1",
      subject,
      accountId: "acc_1",
      accountName: "Cliente Demo",
      dealId: null,
      dealTitle: null,
      dealStageName: null,
      dealFechaEntrega: null,
      dealIsLicitacion: false,
      leadId: null,
      providerThreadId: null,
      isUnread: false,
      archivedAt: null,
      trashedAt: null,
      snoozedUntil: null,
      starredAt: null,
      spamAt: null,
      sharedWithAccount: false,
      lastMessageAt: null,
      aiCategory: null,
      aiUrgency: null,
      aiSentiment: null,
      aiSummary: null,
      aiClassifiedAt: null,
      lastReadAt: null,
      threadSummary: null,
    },
    messages: [],
    attachments: [],
    degraded: false,
  };
}

describe("CorreoWorkSummary — Preguntar al asistente", () => {
  beforeEach(() => {
    dispatchAiCommand.mockClear();
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it("abre el asistente y cierra el Copiloto", () => {
    const onClose = vi.fn();
    render(
      <CorreoWorkSummary
        detail={detailFixture("SoW CIMS")}
        readCursorAt={null}
        onOpenAiLead={vi.fn()}
        onGoTo={vi.fn()}
        onClose={onClose}
        onAssociate={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Preguntar al asistente/i }));

    expect(dispatchAiCommand).toHaveBeenCalledWith({
      prompt: "Respecto a este correo («SoW CIMS»): ",
      autoSend: false,
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
