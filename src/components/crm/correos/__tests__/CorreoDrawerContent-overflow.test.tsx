/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CorreoDrawerContent } from "../CorreoDrawerContent";
import type { CorreoDetail } from "@/modules/crm/email/correos.types";

vi.mock("@/hooks/useEffectivePermissions", () => ({
  useEffectivePermissions: () => ({ crm: { correos: "full" } }),
}));

vi.mock("@/lib/permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/permissions")>();
  return {
    ...actual,
    canEdit: () => true,
  };
});

vi.mock("../CorreoWorkContext", () => ({
  CorreoWorkProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useCorreoWorkOptional: () => null,
  useCorreoWork: () => ({
    threadId: "thread-1",
    tasks: { data: [], loading: false },
    reload: vi.fn(),
  }),
}));

vi.mock("../CorreoTasksStrip", () => ({
  CorreoTasksStrip: () => null,
}));

vi.mock("../CorreoContextChain", () => ({
  CorreoContextChain: () => <div data-testid="context-chain" />,
}));

// El árbol nuevo (bloque de título + breadcrumb) se aísla para que el
// test del menú "⋯" no dependa de la petición suggest-account.
vi.mock("../CorreoReaderTitleBlock", () => ({
  CorreoReaderTitleBlock: () => null,
}));

vi.mock("../useCorreoSuggestedAccounts", () => ({
  useCorreoSuggestedAccounts: () => [],
}));

vi.mock("../CorreoMessages", () => ({
  CorreoMessages: () => <div data-testid="messages" />,
}));

vi.mock("../CorreoReplyBox", () => ({
  CorreoReplyBox: () => <div data-testid="reply" />,
}));

vi.mock("../CorreoThreadActions", () => ({
  CorreoThreadActions: () => null,
}));

vi.mock("../CorreoSystemLabels", () => ({
  CorreoSystemLabels: () => null,
}));

const detail: CorreoDetail = {
  thread: {
    id: "thread-1",
    subject: "Asunto",
    accountId: null,
    accountName: null,
    dealId: null,
    dealTitle: null,
    dealStageName: null,
    dealFechaEntrega: null,
    dealIsLicitacion: false,
    leadId: null,
    providerThreadId: "pt-1",
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

describe("CorreoDrawerContent overflow menu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("con el menú abierto hay scrim y pointerdown lo cierra sin listener mousedown en document", () => {
    const addSpy = vi.spyOn(document, "addEventListener");
    render(
      <CorreoDrawerContent
        detail={detail}
        onOpenWorkPanel={() => {}}
        onAssociate={() => {}}
        onRefresh={() => {}}
        onOpenSignature={() => {}}
        onOpenAiStyle={() => {}}
      />,
    );

    fireEvent.click(screen.getByLabelText("Más acciones"));
    expect(screen.getByRole("menu")).toBeTruthy();
    expect(screen.getByText("Abrir en Gmail")).toBeTruthy();
    expect(screen.getByText("Copiar enlace del hilo")).toBeTruthy();
    expect(screen.queryByText("Firma")).toBeNull();
    expect(screen.queryByText("Estilo de respuesta")).toBeNull();

    const mousedownRegs = addSpy.mock.calls.filter(([type]) => type === "mousedown");
    expect(mousedownRegs).toHaveLength(0);

    const scrim = document.querySelector('[aria-hidden][class*="fixed"]');
    expect(scrim).toBeTruthy();
    fireEvent.pointerDown(scrim!);
    expect(screen.queryByRole("menu")).toBeNull();

    addSpy.mockRestore();
  });
});
