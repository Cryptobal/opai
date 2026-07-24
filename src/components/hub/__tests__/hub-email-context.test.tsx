import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const realtime = vi.hoisted(() => ({
  channel: null as string | null,
  onMailboxChanged: null as (() => void) | null,
  status: "fallback" as "connecting" | "live" | "fallback",
}));

vi.mock("@/components/crm/correos/useCorreosRealtime", () => ({
  useCorreosRealtime: (
    channel: string | null,
    onMailboxChanged: () => void,
  ) => {
    realtime.channel = channel;
    realtime.onMailboxChanged = onMailboxChanged;
    return realtime.status;
  },
}));

import {
  HubEmailProvider,
  useHubEmails,
} from "../hub-email-context";

function payload(subject: string) {
  return {
    connected: true,
    accountEmails: ["yo@empresa.cl"],
    unreadCount: 1,
    realtimeChannel: "private-crm-correos-tenant-user",
    items: [
      {
        id: "thread-1",
        subject,
        fromEmail: "cliente@example.com",
        snippet: null,
        lastMessageAt: "2026-07-24T12:00:00.000Z",
        isUnread: true,
        hasAttachment: false,
        accountEmail: "yo@empresa.cl",
      },
    ],
  };
}

function Probe() {
  const state = useHubEmails();
  return <span>{state?.data?.items[0]?.subject ?? state?.status}</span>;
}

function mockSequentialFetch(...responses: unknown[]) {
  const fetchMock = vi.fn();
  for (const response of responses) {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => response,
    });
  }
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("HubEmailProvider realtime", () => {
  beforeEach(() => {
    realtime.channel = null;
    realtime.onMailboxChanged = null;
    realtime.status = "fallback";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("recarga inmediatamente al recibir mailbox-changed", async () => {
    const fetchMock = mockSequentialFetch(
      payload("Correo inicial"),
      payload("Correo recibido"),
    );
    const view = render(
      <HubEmailProvider>
        <Probe />
      </HubEmailProvider>,
    );

    await waitFor(() => expect(screen.getByText("Correo inicial")).toBeTruthy());
    expect(realtime.channel).toBe("private-crm-correos-tenant-user");

    act(() => realtime.onMailboxChanged?.());

    await waitFor(() => expect(screen.getByText("Correo recibido")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    view.unmount();
  });

  it("revalida al recuperar foco si el snapshot tiene más de 30 segundos", async () => {
    let now = 1_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const fetchMock = mockSequentialFetch(
      payload("Antes del foco"),
      payload("Después del foco"),
    );
    const view = render(
      <HubEmailProvider>
        <Probe />
      </HubEmailProvider>,
    );

    await waitFor(() => expect(screen.getByText("Antes del foco")).toBeTruthy());
    now += 31_000;
    act(() => window.dispatchEvent(new Event("focus")));

    await waitFor(() => expect(screen.getByText("Después del foco")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    view.unmount();
  });
});
