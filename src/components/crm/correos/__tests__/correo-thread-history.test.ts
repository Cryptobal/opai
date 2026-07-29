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
});
