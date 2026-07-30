import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ScheduleSendSplitButton } from "../ScheduleSendSplitButton";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), message: vi.fn() },
}));

describe("ScheduleSendSplitButton", () => {
  const onSend = vi.fn();
  const onSchedule = vi.fn();

  beforeEach(() => {
    onSend.mockClear();
    onSchedule.mockClear();
  });

  it("envía al hacer clic en Enviar", () => {
    render(
      <ScheduleSendSplitButton
        busy={false}
        disabled={false}
        onSend={onSend}
        onSchedule={onSchedule}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Enviar/i }));
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSchedule).not.toHaveBeenCalled();
  });

  it("abre menú hacia arriba y luego modal de presets", () => {
    render(
      <ScheduleSendSplitButton
        busy={false}
        disabled={false}
        onSend={onSend}
        onSchedule={onSchedule}
      />,
    );
    fireEvent.click(screen.getByLabelText("Más opciones de envío"));
    fireEvent.click(screen.getByRole("menuitem", { name: /Programar envío/i }));
    expect(screen.getByRole("heading", { name: "Programar envío" })).toBeTruthy();
    expect(screen.getByText("Mañana por la mañana")).toBeTruthy();
    expect(screen.getByText("Mañana por la tarde")).toBeTruthy();
    expect(screen.getByText("El lunes por la mañana")).toBeTruthy();
    expect(screen.getByText("Elegir fecha y hora")).toBeTruthy();
    expect(document.querySelector('input[type="datetime-local"]')).toBeNull();
  });

  it("programa con un preset", () => {
    render(
      <ScheduleSendSplitButton
        busy={false}
        disabled={false}
        onSend={onSend}
        onSchedule={onSchedule}
      />,
    );
    fireEvent.click(screen.getByLabelText("Más opciones de envío"));
    fireEvent.click(screen.getByRole("menuitem", { name: /Programar envío/i }));
    fireEvent.click(screen.getByText("Mañana por la mañana"));
    expect(onSchedule).toHaveBeenCalledTimes(1);
    const date = onSchedule.mock.calls[0][0] as Date;
    expect(date.getTime()).toBeGreaterThan(Date.now());
  });

  it("abre el modal custom sin datetime-local nativo", () => {
    render(
      <ScheduleSendSplitButton
        busy={false}
        disabled={false}
        onSend={onSend}
        onSchedule={onSchedule}
      />,
    );
    fireEvent.click(screen.getByLabelText("Más opciones de envío"));
    fireEvent.click(screen.getByRole("menuitem", { name: /Programar envío/i }));
    fireEvent.click(screen.getByText("Elegir fecha y hora"));
    expect(screen.getByRole("heading", { name: "Elegir fecha y hora" })).toBeTruthy();
    expect(document.querySelector('input[type="datetime-local"]')).toBeNull();
    expect(screen.getByLabelText("Hora")).toBeTruthy();
    expect(screen.getByLabelText("Minutos")).toBeTruthy();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Programar envío" })).toBeTruthy();
  });

  it("ofrece Enviar y archivar cuando hay callback", () => {
    const onSendAndArchive = vi.fn();
    render(
      <ScheduleSendSplitButton
        busy={false}
        disabled={false}
        onSend={onSend}
        onSendAndArchive={onSendAndArchive}
        sendAndArchiveShortcutHint="⌘↵"
        onSchedule={onSchedule}
      />,
    );
    fireEvent.click(screen.getByLabelText("Más opciones de envío"));
    fireEvent.click(screen.getByRole("menuitem", { name: /Enviar y archivar/i }));
    expect(onSendAndArchive).toHaveBeenCalledTimes(1);
  });
});
