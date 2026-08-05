/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { CorreoMessages } from "../CorreoMessages";
import type { CorreoMessageDTO } from "@/modules/crm/email/correos.types";

vi.mock("../EmailHtmlBody", () => ({
  EmailHtmlBody: ({ htmlBody }: { htmlBody: string | null }) => (
    <div data-testid="html-body">{htmlBody}</div>
  ),
}));

vi.mock("../CorreoMessageRecipients", () => ({
  CorreoMessageRecipients: () => null,
}));

vi.mock("../CorreoInviteRsvpCard", () => ({
  CorreoInviteRsvpCard: () => null,
}));

const scrollIntoViewMock = vi.fn();
vi.mock("../correo-thread-scroll", async () => {
  const actual = await vi.importActual<typeof import("../correo-thread-scroll")>(
    "../correo-thread-scroll",
  );
  return {
    ...actual,
    scheduleThreadOpenScroll: (messageId: string, onDone?: () => void) => {
      scrollIntoViewMock(messageId);
      onDone?.();
      return () => {};
    },
  };
});

function msg(i: number, patch: Partial<CorreoMessageDTO> = {}): CorreoMessageDTO {
  return {
    id: `m${i}`,
    providerMessageId: `pm${i}`,
    direction: i % 2 === 0 ? "in" : "out",
    fromEmail: `persona${i}@example.com`,
    toEmails: ["yo@example.com"],
    ccEmails: [],
    subject: "Asunto",
    htmlBody: `<p>cuerpo ${i}</p>`,
    textBody: `cuerpo ${i}`,
    sentAt: `2026-01-${String(i + 1).padStart(2, "0")}T10:00:00.000Z`,
    ...patch,
  };
}

const chain = (n: number) => Array.from({ length: n }, (_, i) => msg(i));

describe("CorreoMessages — plegado estilo Gmail", () => {
  afterEach(() => {
    scrollIntoViewMock.mockClear();
  });

  it("al abrir ancla el scroll en el penúltimo (peek sobre el último)", async () => {
    render(<CorreoMessages messages={chain(6)} threadId="t1" />);
    await act(async () => {});
    // n=6 → ids m0..m5; resolveThreadOpenScrollId → m4 (penúltimo).
    expect(scrollIntoViewMock).toHaveBeenCalledWith("m4");
  });

  it("hilo largo: solo 3 filas visibles, 1 cuerpo montado y contador de ocultos", () => {
    render(<CorreoMessages messages={chain(37)} threadId="t1" />);

    expect(screen.getAllByTestId("html-body")).toHaveLength(1);
    expect(document.querySelectorAll("[data-correo-message]")).toHaveLength(3);
    expect(screen.getByRole("button", { name: /34 mensajes más/ })).toBeTruthy();
  });

  it("la píldora despliega la cadena completa y vuelve a agrupar", () => {
    render(<CorreoMessages messages={chain(10)} threadId="t1" />);
    fireEvent.click(screen.getByRole("button", { name: /7 mensajes más/ }));
    expect(document.querySelectorAll("[data-correo-message]")).toHaveLength(10);

    fireEvent.click(screen.getByRole("button", { name: /Agrupar historial/ }));
    expect(document.querySelectorAll("[data-correo-message]")).toHaveLength(3);
  });

  it("hilo corto no muestra contador y abre el último", () => {
    render(<CorreoMessages messages={chain(3)} threadId="t1" />);
    expect(screen.queryByRole("button", { name: /mensajes más/ })).toBeNull();
    expect(screen.getAllByTestId("html-body")).toHaveLength(1);
    expect(screen.getByText("<p>cuerpo 2</p>")).toBeTruthy();
  });

  it("no leídos quedan fuera del grupo y abren expandidos", () => {
    render(
      <CorreoMessages messages={chain(12)} threadId="t1" unreadMessageIds={["m4", "m5"]} />,
    );
    expect(screen.getAllByTestId("html-body")).toHaveLength(3);
    expect(screen.getByRole("button", { name: /7 mensajes más/ })).toBeTruthy();
  });

  it("deep-link a un mensaje agrupado lo saca del grupo y lo expande", () => {
    render(<CorreoMessages messages={chain(12)} threadId="t1" initialMessageId="m3" />);
    expect(screen.getByText("<p>cuerpo 3</p>")).toBeTruthy();
    expect(screen.getByRole("button", { name: /8 mensajes más/ })).toBeTruthy();
  });

  it("expandir todo abre la cadena completa", () => {
    const { rerender } = render(<CorreoMessages messages={chain(6)} threadId="t1" />);
    expect(screen.getAllByTestId("html-body")).toHaveLength(1);
    rerender(<CorreoMessages messages={chain(6)} threadId="t1" expandAllNonce={1} />);
    expect(screen.getAllByTestId("html-body")).toHaveLength(6);
  });

  it("tocar una fila colapsada abre ese mensaje", () => {
    render(<CorreoMessages messages={chain(6)} threadId="t1" />);
    const rows = document.querySelectorAll("[data-correo-message]");
    fireEvent.click(rows[0]);
    expect(screen.getByText("<p>cuerpo 0</p>")).toBeTruthy();
  });
});
