import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  closeCorreoThreadInHistory,
  openCorreoThreadInHistory,
} from "../correo-thread-history";

describe("historial del lector de correos", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/crm/correos");
    vi.restoreAllMocks();
  });

  it("abre desde la lista y vuelve a la entrada anterior al cerrar", () => {
    openCorreoThreadInHistory("thread-a", false);
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});

    // Deep-link dual: ?thread= (legacy) + ?hilo= (canónico ES).
    expect(window.location.search).toBe("?thread=thread-a&hilo=thread-a");
    expect(window.history.state.correoThread).toBe(true);
    expect(closeCorreoThreadInHistory()).toBe("back");
    // URL limpia al instante (antes del popstate) + consume la entrada.
    expect(window.location.search).toBe("");
    expect(back).toHaveBeenCalledOnce();
  });

  it("al cambiar un deep-link no inventa una entrada que navegue fuera", () => {
    window.history.replaceState({}, "", "/crm/correos?thread=deep-link");

    openCorreoThreadInHistory("thread-b", true);

    expect(window.location.search).toBe("?thread=thread-b&hilo=thread-b");
    expect(window.history.state.correoThread).toBeUndefined();
    expect(closeCorreoThreadInHistory()).toBe("replaced");
    expect(window.location.search).toBe("");
  });

  it("incluye mensaje en la URL y lo limpia al cerrar", () => {
    openCorreoThreadInHistory("thread-c", false, "msg-9");
    expect(window.location.search).toBe(
      "?thread=thread-c&hilo=thread-c&mensaje=msg-9",
    );
    vi.spyOn(window.history, "back").mockImplementation(() => {});
    expect(closeCorreoThreadInHistory()).toBe("back");
    expect(window.location.search).toBe("");
  });

  it("overlay del lector conserva el marcador correoThread al apilarse", () => {
    openCorreoThreadInHistory("thread-overlay", false);
    window.history.pushState(
      { ...(window.history.state ?? {}), correoReader: true },
      "",
      window.location.href,
    );
    expect(window.history.state.correoThread).toBe(true);
    expect(window.history.state.correoReader).toBe(true);

    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    expect(closeCorreoThreadInHistory()).toBe("back");
    expect(window.location.search).toBe("");
    expect(back).toHaveBeenCalledOnce();
  });

  it("overlay sin spread pierde marcador — el guard de cierre debe usar back si la URL tenía hilo", () => {
    openCorreoThreadInHistory("thread-bug", false);
    // Bug histórico: pushState del sheet pisaba el state completo.
    window.history.pushState({ correoReader: true }, "", window.location.href);
    expect(window.history.state.correoThread).toBeUndefined();

    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    // Tras el fix, si la URL aún tiene ?hilo= tratamos la entrada como propia.
    expect(closeCorreoThreadInHistory()).toBe("back");
    expect(window.location.search).toBe("");
    expect(back).toHaveBeenCalledOnce();
  });

  it("en SSR no toca window", () => {
    const desc = Object.getOwnPropertyDescriptor(globalThis, "window");
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: undefined,
    });
    try {
      expect(() => openCorreoThreadInHistory("t", false)).not.toThrow();
      expect(closeCorreoThreadInHistory()).toBe("replaced");
    } finally {
      if (desc) Object.defineProperty(globalThis, "window", desc);
    }
  });
});
