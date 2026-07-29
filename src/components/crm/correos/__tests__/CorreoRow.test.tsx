import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CorreoRow } from "../CorreoRow";
import { CorreoRowMobile } from "../CorreoRowMobile";
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
  starredAt: null,
  spamAt: null,
  hasDraft: false,
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
    const { container } = render(
      <CorreoRow thread={thread} canModify={false} onOpen={vi.fn()} selected />,
    );
    expect(
      screen
        .getByRole("button", { name: /Propuesta comercial/i })
        .getAttribute("aria-current"),
    ).toBe("true");
    const row = container.querySelector("[data-correo-row]");
    expect(row?.getAttribute("data-active")).toBe("true");
    expect(row?.className).toMatch(/bg-primary\/15/);
    expect(row?.className).toMatch(/border-l-primary/);
  });

  it("tinte azulado en fila enfocada (j/k) sin abrir", () => {
    const { container } = render(
      <CorreoRow thread={thread} canModify={false} onOpen={vi.fn()} focused />,
    );
    const row = container.querySelector("[data-correo-row]");
    expect(row?.getAttribute("data-active")).toBe("true");
    expect(row?.className).toMatch(/bg-primary\/10/);
  });

  it("muestra clip en desktop cuando hay adjuntos", () => {
    render(
      <CorreoRow
        thread={{ ...thread, attachmentCount: 2 }}
        canModify={false}
        onOpen={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("2 adjuntos")).toBeTruthy();
  });

  it("muestra cuenta CRM junto al asunto", () => {
    render(
      <CorreoRow
        thread={{
          ...thread,
          accountId: "acc-1",
          accountName: "Coexpan",
        }}
        canModify={false}
        onOpen={vi.fn()}
      />,
    );
    expect(screen.getByText("Coexpan")).toBeTruthy();
  });
});

describe("CorreoRowMobile", () => {
  it("muestra clip cuando el hilo tiene adjuntos", () => {
    render(
      <CorreoRowMobile
        thread={{ ...thread, attachmentCount: 3 }}
        onOpen={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("3 adjuntos")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /3 adjuntos/i }),
    ).toBeTruthy();
  });

  it("no muestra clip sin adjuntos", () => {
    render(<CorreoRowMobile thread={thread} onOpen={vi.fn()} />);
    expect(screen.queryByLabelText(/adjuntos/)).toBeNull();
  });

  it("muestra cuenta CRM junto al asunto", () => {
    render(
      <CorreoRowMobile
        thread={{
          ...thread,
          accountId: "acc-1",
          accountName: "Coexpan",
          hasDraft: true,
        }}
        onOpen={vi.fn()}
      />,
    );
    expect(screen.getByText("Coexpan")).toBeTruthy();
  });
});
