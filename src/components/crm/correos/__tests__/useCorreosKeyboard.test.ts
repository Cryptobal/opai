/**
 * Atajos de bandeja/lector: con el lector abierto R/A/F deben disparar
 * compose (no quedar huérfanos esperando a CorreoReplyBox).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import {
  isEditableKeyboardTarget,
  useCorreosKeyboard,
} from "../useCorreosKeyboard";
import { DEFAULT_CORREO_SHORTCUTS } from "../useCorreosViewPreferences";

function dispatchKey(key: string, target: EventTarget = window) {
  target.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
  );
}

describe("useCorreosKeyboard", () => {
  const handlers = {
    onDown: vi.fn(),
    onUp: vi.fn(),
    onOpen: vi.fn(),
    onToggleSelect: vi.fn(),
    onArchive: vi.fn(),
    onReply: vi.fn(),
    onReplyAll: vi.fn(),
    onForward: vi.fn(),
    onTrash: vi.fn(),
    onStar: vi.fn(),
    onSnooze: vi.fn(),
    onToggleRead: vi.fn(),
    onFocusSearch: vi.fn(),
    onAiMenu: vi.fn(),
    onHelp: vi.fn(),
  };

  beforeEach(() => {
    for (const fn of Object.values(handlers)) fn.mockClear();
  });

  afterEach(() => {
    // hooks se desmontan solos al terminar cada it
  });

  it("con lector abierto dispara atajos de compose (R/A/F)", () => {
    renderHook(() =>
      useCorreosKeyboard({
        ...handlers,
        shortcuts: DEFAULT_CORREO_SHORTCUTS,
        replyHandledExternally: true,
        enabled: true,
      }),
    );

    dispatchKey("r");
    dispatchKey("a");
    dispatchKey("f");

    expect(handlers.onReply).toHaveBeenCalledTimes(1);
    expect(handlers.onReplyAll).toHaveBeenCalledTimes(1);
    expect(handlers.onForward).toHaveBeenCalledTimes(1);
  });

  it("con lector abierto prioriza compose ante colisión con bandeja", () => {
    const shortcuts = {
      ...DEFAULT_CORREO_SHORTCUTS,
      archive: "a",
      replyAll: "a",
    };
    renderHook(() =>
      useCorreosKeyboard({
        ...handlers,
        shortcuts,
        replyHandledExternally: true,
        enabled: true,
      }),
    );

    dispatchKey("a");
    expect(handlers.onReplyAll).toHaveBeenCalledTimes(1);
    expect(handlers.onArchive).not.toHaveBeenCalled();
  });

  it("con lector cerrado también abre compose con R", () => {
    renderHook(() =>
      useCorreosKeyboard({
        ...handlers,
        shortcuts: DEFAULT_CORREO_SHORTCUTS,
        replyHandledExternally: false,
        enabled: true,
      }),
    );

    dispatchKey("r");
    expect(handlers.onReply).toHaveBeenCalledTimes(1);
  });

  it("no captura teclas dentro de inputs", () => {
    renderHook(() =>
      useCorreosKeyboard({
        ...handlers,
        shortcuts: DEFAULT_CORREO_SHORTCUTS,
        replyHandledExternally: true,
        enabled: true,
      }),
    );
    const input = document.createElement("input");
    document.body.appendChild(input);
    dispatchKey("r", input);
    expect(handlers.onReply).not.toHaveBeenCalled();
    input.remove();
  });

  it("no captura flechas dentro del typeahead de destinatarios", () => {
    renderHook(() =>
      useCorreosKeyboard({
        ...handlers,
        shortcuts: DEFAULT_CORREO_SHORTCUTS,
        replyHandledExternally: true,
        enabled: true,
      }),
    );
    const wrap = document.createElement("div");
    wrap.setAttribute("data-recipient-field", "");
    const input = document.createElement("input");
    input.setAttribute("role", "combobox");
    wrap.appendChild(input);
    document.body.appendChild(wrap);
    dispatchKey("ArrowDown", input);
    dispatchKey("ArrowUp", input);
    expect(handlers.onDown).not.toHaveBeenCalled();
    expect(handlers.onUp).not.toHaveBeenCalled();
    wrap.remove();
  });

  it("no captura archivar al escribir en gmp-place-autocomplete (Shadow DOM)", () => {
    renderHook(() =>
      useCorreosKeyboard({
        ...handlers,
        shortcuts: DEFAULT_CORREO_SHORTCUTS,
        replyHandledExternally: true,
        enabled: true,
      }),
    );
    const host = document.createElement("gmp-place-autocomplete");
    document.body.appendChild(host);
    dispatchKey("e", host);
    expect(handlers.onArchive).not.toHaveBeenCalled();
    host.remove();
  });

  it("isEditableKeyboardTarget reconoce host gmp y activeElement profundo", () => {
    const host = document.createElement("gmp-place-autocomplete");
    document.body.appendChild(host);
    const fromHost = new KeyboardEvent("keydown", {
      key: "e",
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(fromHost, "target", { value: host });
    expect(isEditableKeyboardTarget(fromHost)).toBe(true);

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    const fromWindow = new KeyboardEvent("keydown", {
      key: "e",
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(fromWindow, "target", { value: window });
    expect(isEditableKeyboardTarget(fromWindow)).toBe(true);

    input.remove();
    host.remove();
  });
});
