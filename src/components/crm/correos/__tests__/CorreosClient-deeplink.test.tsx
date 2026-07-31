/** @vitest-environment jsdom */
/**
 * Deep-link del copiloto: ?q=…&hilo=…&mensaje=…
 * CorreosClient debe iniciar con la búsqueda sembrada, el hilo abierto y un
 * único fetchPage inicial que ya incluye `q` (sin fetch previo con q vacío).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";

const THREAD_ID = "11111111-2222-4333-8444-555555555555";
const MESSAGE_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

const hoisted = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
  drawerProps: { current: null as Record<string, unknown> | null },
  fetchMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => hoisted.searchParams,
}));

vi.mock("@/components/opai-ds", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/opai-ds")>();
  return {
    ...actual,
    useSetIslandModuleMenu: () => {},
    useSetIslandSearch: () => {},
    useSetIslandSuppressed: () => {},
  };
});

vi.mock("@/hooks/useEffectivePermissions", () => ({
  useEffectivePermissions: () => ({ capabilities: {} }),
}));

vi.mock("@/components/opai/ChatPageContextProvider", () => ({
  useRegisterChatPageContext: () => {},
}));

// Hijos pesados → stubs. CorreoDrawer captura props para las aserciones.
vi.mock("../CorreosDesktopRail", () => ({ CorreosDesktopRail: () => null }));
vi.mock("../CorreosDesktopToolbar", () => ({ CorreosDesktopToolbar: () => null }));
vi.mock("../CorreoSearchChips", () => ({ CorreoSearchChips: () => null }));
vi.mock("../CorreoSearchScopeHint", () => ({ CorreoSearchScopeHint: () => null }));
vi.mock("../CorreosMobileDrawer", () => ({ CorreosMobileDrawer: () => null }));
vi.mock("../CorreosPullToRefresh", () => ({
  CorreosPullToRefresh: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("../CorreoSwipeSettingsSheet", () => ({ CorreoSwipeSettingsSheet: () => null }));
vi.mock("../CorreoSnoozeSettingsSheet", () => ({ CorreoSnoozeSettingsSheet: () => null }));
vi.mock("../CorreoShortcutsSheet", () => ({ CorreoShortcutsSheet: () => null }));
vi.mock("../CorreoContextMenu", () => ({ CorreoContextMenu: () => null }));
vi.mock("../CorreoSelectionBar", () => ({ CorreoSelectionBar: () => null }));
vi.mock("../CorreoRowSwipe", () => ({
  CorreoRowSwipe: ({ thread }: { thread: { id: string } }) => (
    <div data-correo-row={thread.id} />
  ),
}));
vi.mock("../CorreoDrawer", () => ({
  CorreoDrawer: (props: Record<string, unknown>) => {
    hoisted.drawerProps.current = props;
    return null;
  },
}));
vi.mock("../CorreoSnoozeSheet", () => ({ CorreoSnoozeSheet: () => null }));
vi.mock("../CorreoComposeSheet", () => ({ CorreoComposeSheet: () => null }));
vi.mock("../CorreoScheduledList", () => ({ CorreoScheduledList: () => null }));
vi.mock("../CorreosSyncBanner", () => ({ CorreosSyncBanner: () => null }));
vi.mock("../CorreoAiMenuSheet", () => ({ CorreoAiMenuSheet: () => null }));
vi.mock("../CorreoAiStyleSheet", () => ({ CorreoAiStyleSheet: () => null }));
vi.mock("../CorreoAiActionPanel", () => ({ CorreoAiActionPanel: () => null }));
vi.mock("../CorreoAiMenu", () => ({ buildAiMenuItems: () => [] }));

// Hooks y stores → stubs sin red ni timers.
vi.mock("../useCorreoFocusScope", () => ({ useCorreoFocusScope: () => {} }));
vi.mock("../useCorreosKeyboard", () => ({ useCorreosKeyboard: () => {} }));
vi.mock("../useCorreosRealtime", () => ({ useCorreosRealtime: () => "offline" }));
vi.mock("../useCloseOnBack", () => ({ useCloseOnBack: () => {} }));
vi.mock("../useCorreosViewPreferences", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../useCorreosViewPreferences")>();
  return {
    ...actual,
    focusCorreosSearch: () => {},
    useCorreosViewPreferences: () => ({
      panelWidth: 560,
      desktopReaderMode: "contained",
      previewLines: 2,
      setPreviewLines: () => {},
      swipeConfig: { right: ["archive", "snooze"], left: ["trash", "read"] },
      setSwipeConfig: () => {},
      railCollapsed: true,
      setRailCollapsed: () => {},
      shortcuts: {},
      setShortcuts: () => {},
      alwaysShowImages: false,
      setAlwaysShowImages: () => {},
      undoSeconds: 10,
      setUndoSeconds: () => {},
      snoozeConfig: {},
      setSnoozeConfig: () => {},
      resetPanelWidth: () => {},
      onResizePointerDown: () => {},
      onResizeKeyDown: () => {},
    }),
  };
});
vi.mock("../offline-store", () => ({
  flushOfflineActions: () => Promise.resolve(0),
  flushOfflineSends: () => Promise.resolve(0),
  loadInboxSnapshot: () => Promise.resolve(null),
  saveInboxSnapshot: () => Promise.resolve(),
}));
vi.mock("../correo-thread-action-client", () => ({
  runCorreoAction: vi.fn(),
  snoozeThread: vi.fn(),
}));
vi.mock("../CorreoBulkBar", () => ({ runBulkCorreoAction: vi.fn() }));

import { CorreosClient } from "../CorreosClient";

const THREAD_ROW = {
  id: THREAD_ID,
  subject: "Propuesta Seguridad",
  fromEmail: "cliente@example.cl",
  snippet: "…",
  isUnread: true,
  attachmentCount: 0,
  accountId: null,
  accountName: null,
  dealId: null,
  dealTitle: null,
  leadId: null,
  slaLevel: "ok",
  lastMessageAt: "2026-07-01T12:00:00.000Z",
  starredAt: null,
  emailAccountId: null,
};

function listResponse() {
  return {
    items: [THREAD_ROW],
    nextCursor: null,
    connected: true,
    canModify: true,
    counts: { inbox: 1, archived: 0, all: 1, trash: 0, snoozed: 0 },
    accounts: [],
    activeAccountId: null,
    defaultAccountId: null,
    realtimeChannel: null,
  };
}

function correosListCalls(): string[] {
  return hoisted.fetchMock.mock.calls
    .map(([url]) => String(url))
    .filter((url) => url.startsWith("/api/crm/correos?"));
}

beforeEach(() => {
  hoisted.drawerProps.current = null;
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
  }
  hoisted.fetchMock.mockReset();
  hoisted.fetchMock.mockImplementation((url: unknown) => {
    const u = String(url);
    if (u.startsWith("/api/crm/correos?")) {
      return Promise.resolve({
        json: () => Promise.resolve(listResponse()),
      });
    }
    return Promise.resolve({ json: () => Promise.resolve({}) });
  });
  vi.stubGlobal("fetch", hoisted.fetchMock);
  window.sessionStorage.clear();
});

describe("CorreosClient — deep-link del copiloto", () => {
  it("con ?q&hilo&mensaje siembra la búsqueda, abre el hilo y hace UN fetch con q", async () => {
    hoisted.searchParams = new URLSearchParams(
      `q=${encodeURIComponent("foo in:all")}&hilo=${THREAD_ID}&mensaje=${MESSAGE_ID}`,
    );
    render(<CorreosClient />);

    await waitFor(() => expect(correosListCalls().length).toBe(1));
    const qs = new URLSearchParams(correosListCalls()[0]!.split("?")[1]);
    // El primer (único) fetch ya lleva la búsqueda: debouncedQuery sembrado.
    expect(qs.get("q")).toBe("foo in:all");

    // Hilo abierto + mensaje propagado al lector.
    await waitFor(() =>
      expect(hoisted.drawerProps.current?.threadId).toBe(THREAD_ID),
    );
    expect(hoisted.drawerProps.current?.initialMessageId).toBe(MESSAGE_ID);

    // Sin segundo fetch tras la ventana del debounce (300ms).
    await new Promise((r) => setTimeout(r, 450));
    expect(correosListCalls().length).toBe(1);
  });

  it("con solo ?hilo (link antiguo sin q) abre el hilo sin sembrar búsqueda", async () => {
    hoisted.searchParams = new URLSearchParams(`hilo=${THREAD_ID}`);
    render(<CorreosClient />);

    await waitFor(() => expect(correosListCalls().length).toBe(1));
    const qs = new URLSearchParams(correosListCalls()[0]!.split("?")[1]);
    expect(qs.get("q")).toBeNull();
    await waitFor(() =>
      expect(hoisted.drawerProps.current?.threadId).toBe(THREAD_ID),
    );
  });

  it("q malformado (solo operadores colgantes) no rompe ni dispara doble fetch", async () => {
    hoisted.searchParams = new URLSearchParams(
      `q=${encodeURIComponent("from: in:all")}&hilo=${THREAD_ID}`,
    );
    render(<CorreosClient />);

    await waitFor(() => expect(correosListCalls().length).toBe(1));
    const qs = new URLSearchParams(correosListCalls()[0]!.split("?")[1]);
    expect(qs.get("q")).toBe("from: in:all");
    await new Promise((r) => setTimeout(r, 450));
    expect(correosListCalls().length).toBe(1);
  });

  it("hilo con formato no-UUID se ignora (sin lector) pero la búsqueda aplica", async () => {
    hoisted.searchParams = new URLSearchParams(
      `q=${encodeURIComponent("foo")}&hilo=no-es-uuid`,
    );
    render(<CorreosClient />);

    await waitFor(() => expect(correosListCalls().length).toBe(1));
    const qs = new URLSearchParams(correosListCalls()[0]!.split("?")[1]);
    expect(qs.get("q")).toBe("foo");
    expect(hoisted.drawerProps.current?.threadId ?? null).toBeNull();
  });
});
