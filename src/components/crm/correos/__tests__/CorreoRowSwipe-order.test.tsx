/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { CorreoThreadDTO } from "@/modules/crm/email/correos.types";
import { DEFAULT_CORREO_SWIPE_CONFIG } from "../useCorreosViewPreferences";

const runCorreoAction = vi.fn();
vi.mock("../correo-thread-action-client", () => ({
  runCorreoAction: (...args: unknown[]) => runCorreoAction(...args),
}));

vi.mock("../CorreoRow", () => ({
  CorreoRow: () => <div data-testid="correo-row" />,
}));

vi.mock("@/components/chat/hooks/useSwipeGesture", () => ({
  useSwipeGesture: () => ({
    x: { on: () => () => {} },
    openSide: "right" as const,
    touchAction: "pan-y",
    rowRef: { current: null },
    measureWidth: vi.fn(),
    close: vi.fn(),
    wasDragged: () => false,
    longPressHandlers: {},
    dragProps: {},
  }),
}));

vi.mock("../correo-touch-ui", () => ({
  useCorreoTouchUi: () => true,
}));

import { CorreoRowSwipe } from "../CorreoRowSwipe";

const thread = {
  id: "t1",
  subject: "Hola",
  fromEmail: "a@b.com",
  snippet: "snippet",
  lastMessageAt: "2026-07-22T12:00:00.000Z",
  emailAccountId: null,
  accountId: null,
  accountName: null,
  dealId: null,
  dealTitle: null,
  dealStageName: null,
  leadId: null,
  attachmentCount: 0,
  messageCount: 1,
  providerThreadId: "g1",
  possibleLead: false,
  isUnread: true,
  archivedAt: null,
  trashedAt: null,
  snoozedUntil: null,
  starredAt: null,
  spamAt: null,
  hasDraft: false,
  pendingSince: null,
  slaLevel: null,
  slaLabel: null,
  openTaskCount: 0,
  taskDueLevel: null,
} as CorreoThreadDTO;

describe("CorreoRowSwipe — orden de botones", () => {
  beforeEach(() => {
    runCorreoAction.mockReset();
    runCorreoAction.mockResolvedValue(true);
  });

  it("Acción 1 derecha (junto al correo) ejecuta archive, no reply", () => {
    const onOpen = vi.fn();
    render(
      <CorreoRowSwipe
        thread={thread}
        canModify
        swipeConfig={{
          right: ["archive", "reply"],
          left: DEFAULT_CORREO_SWIPE_CONFIG.left,
        }}
        onOpen={onOpen}
        onRemove={vi.fn()}
      />,
    );

    // Strip derecho: [reply, archive] visual — el segundo botón (junto al row) es Acción 1.
    const archiveBtn = screen.getByRole("button", { name: "Archivar", hidden: true });
    archiveBtn.click();
    expect(onOpen).not.toHaveBeenCalled();
    expect(runCorreoAction).toHaveBeenCalled();
  });
});
