import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CorreoRow } from "../CorreoRow";
import type { CorreoThreadDTO } from "@/modules/crm/email/correos.types";

const thread: CorreoThreadDTO = {
  id: "thread-1",
  subject: "Propuesta comercial",
  fromEmail: "cliente@example.com",
  snippet: "Este es un extracto suficientemente largo para probar la vista previa.",
  lastMessageAt: "2026-07-22T12:00:00.000Z",
  accountId: null,
  accountName: null,
  dealId: null,
  dealTitle: null,
  leadId: null,
  attachmentCount: 0,
  messageCount: 1,
  providerThreadId: "gmail-thread",
  possibleLead: false,
  isUnread: true,
  archivedAt: null,
  trashedAt: null,
  snoozedUntil: null,
};

describe("CorreoRow (desktop denso)", () => {
  it("aplica densidad compacta con 1 línea", () => {
    const { container } = render(
      <CorreoRow thread={thread} canModify={false} onOpen={vi.fn()} previewLines={1} />,
    );
    expect(container.querySelector('[data-density="compact"]')).toBeTruthy();
  });

  it("muestra remitente limpio y snippet inline en una línea", () => {
    const { container } = render(
      <CorreoRow thread={thread} canModify={false} onOpen={vi.fn()} previewLines={2} />,
    );
    expect(container.querySelector('[data-density="comfortable"]')).toBeTruthy();
    // parseSender: email pelado → parte local, no el header crudo.
    expect(screen.getByText("cliente")).toBeTruthy();
    expect(screen.getByText(/Este es un extracto/)).toBeTruthy();
  });

  it("marca el hilo seleccionado", () => {
    render(
      <CorreoRow thread={thread} canModify={false} onOpen={vi.fn()} selected />,
    );
    expect(
      screen
        .getByRole("button", { name: /Propuesta comercial/i })
        .getAttribute("aria-current"),
    ).toBe("true");
  });
});
