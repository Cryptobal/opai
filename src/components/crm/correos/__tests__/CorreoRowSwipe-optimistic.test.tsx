/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import type { CorreoThreadDTO } from "@/modules/crm/email/correos.types";

const runCorreoAction = vi.fn();
vi.mock("../correo-thread-action-client", () => ({
  runCorreoAction: (...args: unknown[]) => runCorreoAction(...args),
}));

vi.mock("../CorreoRow", () => ({
  CorreoRow: () => <div data-testid="correo-row" />,
}));

import { CorreoRowSwipe } from "../CorreoRowSwipe";
import type { CorreoSwipeConfig } from "../useCorreosViewPreferences";

const thread: CorreoThreadDTO = {
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
};

const swipeConfig: CorreoSwipeConfig = {
  right: ["read", "star"],
  left: ["archive", "trash"],
};

describe("CorreoRowSwipe — acciones optimistas", () => {
  beforeEach(() => {
    runCorreoAction.mockReset();
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        matches: query.includes("pointer: coarse"),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
  });

  it("read aplica patch antes de resolverse la promesa y revierte si falla", async () => {
    let resolve!: (v: boolean) => void;
    runCorreoAction.mockReturnValue(
      new Promise<boolean>((r) => {
        resolve = r;
      }),
    );
    const patches: Array<Partial<CorreoThreadDTO>> = [];
    const onPatch = vi.fn((id: string, partial: Partial<CorreoThreadDTO>) => {
      expect(id).toBe("t1");
      patches.push(partial);
    });

    const { container } = render(
      <CorreoRowSwipe
        thread={thread}
        canModify
        onOpen={vi.fn()}
        onPatch={onPatch}
        onChanged={vi.fn()}
        swipeConfig={swipeConfig}
      />,
    );

    // Esperar coarse=true
    await act(async () => {
      await Promise.resolve();
    });

    const row = container.querySelector("[data-correo-swipe-row]");
    expect(row).toBeTruthy();

    // Ejecutar acción read vía botón del strip (forzar openSide no hace falta:
    // llamamos al handler del botón si está montado; si no, invocamos execute
    // indirectamente abriendo el strip con drag). Tocamos el botón Leído.
    const buttons = container.querySelectorAll("button");
    const readBtn = Array.from(buttons).find((b) => b.textContent?.includes("Leído"));
    expect(readBtn).toBeTruthy();

    await act(async () => {
      readBtn!.click();
    });

    // Patch optimista ya aplicado, promesa aún pendiente.
    expect(patches[0]).toEqual({ isUnread: false });
    expect(runCorreoAction).toHaveBeenCalled();

    await act(async () => {
      resolve(false);
      await Promise.resolve();
    });
    expect(patches[1]).toEqual({ isUnread: true });
  });
});
