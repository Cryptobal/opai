import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ComposerModeSwitcher } from "../ComposerModeSwitcher";

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
});

describe("ComposerModeSwitcher", () => {
  it("muestra el modo actual y permite cambiar a Reenviar", () => {
    const onChange = vi.fn();
    render(
      <ComposerModeSwitcher
        mode="reply"
        replyAllAvailable
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /modo: responder/i }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: /reenviar/i }));
    expect(onChange).toHaveBeenCalledWith("forward");
  });

  it("oculta A todos cuando no hay reply-all", () => {
    render(
      <ComposerModeSwitcher
        mode="reply"
        replyAllAvailable={false}
        onChange={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /modo: responder/i }));
    expect(screen.queryByRole("menuitemradio", { name: /a todos/i })).toBeNull();
    expect(screen.getByRole("menuitemradio", { name: /reenviar/i })).toBeTruthy();
  });
});
