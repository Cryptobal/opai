import { describe, expect, it } from "vitest";
import { isTransientNetworkError } from "../help-chat-network-error";

describe("isTransientNetworkError", () => {
  it("detecta Load failed de WebKit/Safari (iPad background)", () => {
    expect(isTransientNetworkError(new TypeError("Load failed"))).toBe(true);
  });

  it("detecta Failed to fetch", () => {
    expect(isTransientNetworkError(new TypeError("Failed to fetch"))).toBe(true);
  });

  it("no trata AbortError como red transitoria (stop manual)", () => {
    const err = new Error("Aborted");
    err.name = "AbortError";
    expect(isTransientNetworkError(err)).toBe(false);
  });

  it("no trata errores de negocio del asistente", () => {
    expect(isTransientNetworkError(new Error("No tienes acceso al asistente"))).toBe(
      false,
    );
  });
});
