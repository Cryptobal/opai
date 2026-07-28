import { describe, it, expect, beforeEach } from "vitest";
import { setCorreoComposeInHistory } from "../correo-compose-history";

describe("setCorreoComposeInHistory", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/crm/correos");
  });

  it("agrega compose=1 al abrir", () => {
    setCorreoComposeInHistory(true);
    expect(new URL(window.location.href).searchParams.get("compose")).toBe("1");
  });

  it("quita compose al cerrar (regresión: refresh no reabre)", () => {
    window.history.replaceState({}, "", "/crm/correos?compose=1&folder=inbox");
    setCorreoComposeInHistory(false);
    const sp = new URL(window.location.href).searchParams;
    expect(sp.get("compose")).toBeNull();
    expect(sp.get("folder")).toBe("inbox");
  });

  it("es no-op si el estado ya coincide", () => {
    window.history.replaceState({ keep: true }, "", "/crm/correos?compose=1");
    const before = window.history.state;
    setCorreoComposeInHistory(true);
    expect(window.history.state).toBe(before);
  });
});
