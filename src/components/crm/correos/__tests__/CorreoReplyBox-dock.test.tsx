/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { CorreoReplyBox } from "../CorreoReplyBox";
import { CorreoReaderDockContext } from "../CorreoReaderDockContext";
import type { ReplyBoxDetail } from "../CorreoReplyBox";

vi.mock("../CorreoComposerBox", () => ({
  CorreoComposerBox: () => <div data-testid="composer" />,
}));

const detail: ReplyBoxDetail = {
  thread: {
    id: "thread-1",
    subject: "Asunto",
    accountId: null,
    dealId: null,
    contactId: null,
  },
  messages: [
    {
      id: "m1",
      providerMessageId: "pm1",
      direction: "in",
      fromEmail: "a@example.com",
      toEmails: ["b@example.com"],
      ccEmails: [],
      subject: "Asunto",
      textBody: "hola",
      htmlBody: null,
      sentAt: new Date().toISOString(),
    },
  ],
  attachments: [],
};

describe("CorreoReplyBox dock Gmail", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({ to: "a@example.com", replyAll: null }),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sin dock: renderiza la barra inline", async () => {
    render(<CorreoReplyBox detail={detail} onSent={() => {}} />);
    expect(await screen.findByRole("button", { name: "Responder" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reenviar" })).toBeTruthy();
  });

  it("con dock enabled sin host: no renderiza inline (evita flash)", async () => {
    const { container } = render(
      <CorreoReaderDockContext.Provider value={{ host: null, enabled: true }}>
        <CorreoReplyBox detail={detail} onSent={() => {}} />
      </CorreoReaderDockContext.Provider>,
    );
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("button", { name: "Responder" })).toBeNull();
  });

  it("con dock host: porta Responder/Reenviar al host fuera del scroll", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);

    render(
      <CorreoReaderDockContext.Provider value={{ host, enabled: true }}>
        <div data-testid="scroll">
          <CorreoReplyBox detail={detail} onSent={() => {}} />
        </div>
      </CorreoReaderDockContext.Provider>,
    );

    await waitFor(() => {
      expect(host.querySelector("[data-correo-reply-anchor]")).toBeTruthy();
    });
    expect(
      screen.getByTestId("scroll").querySelector("[data-correo-reply-anchor]"),
    ).toBeNull();
    expect(host.querySelector('[aria-label="Responder"]')).toBeTruthy();
    expect(host.querySelector('[aria-label="Reenviar"]')).toBeTruthy();

    host.remove();
  });
});
