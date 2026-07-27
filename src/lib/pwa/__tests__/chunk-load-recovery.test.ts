import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests del detector de ChunkLoadError (sin montar listeners de window:
 * el recovery real se valida en integración / PWA).
 */

describe("isChunkLoadError (via install side-effects)", () => {
  beforeEach(() => {
    vi.resetModules();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("dispara recovery ante ChunkLoadError y limpia caches opai-*", async () => {
    const deleteMock = vi.fn(async () => true);
    const keysMock = vi.fn(async () => ["opai-v14", "opai-v15", "other-cache"]);
    Object.defineProperty(globalThis, "caches", {
      configurable: true,
      value: { keys: keysMock, delete: deleteMock },
    });

    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { reload },
    });

    const { installChunkLoadRecovery } = await import("../chunk-load-recovery");
    const dispose = installChunkLoadRecovery();

    window.dispatchEvent(
      new ErrorEvent("error", {
        error: { name: "ChunkLoadError", message: "Loading chunk 123 failed" },
        message: "Loading chunk 123 failed",
      }),
    );

    // recovery es async
    await vi.waitFor(() => expect(reload).toHaveBeenCalled());
    expect(keysMock).toHaveBeenCalled();
    expect(deleteMock).toHaveBeenCalledWith("opai-v14");
    expect(deleteMock).toHaveBeenCalledWith("opai-v15");
    expect(deleteMock).not.toHaveBeenCalledWith("other-cache");
    expect(sessionStorage.getItem("opai.pwa.chunk-reload")).toBe("1");

    dispose();
  });

  it("no entra en loop si ya se intentó recovery en la sesión", async () => {
    sessionStorage.setItem("opai.pwa.chunk-reload", "1");
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { reload },
    });

    const { installChunkLoadRecovery } = await import("../chunk-load-recovery");
    const dispose = installChunkLoadRecovery();

    window.dispatchEvent(
      new PromiseRejectionEvent("unhandledrejection", {
        promise: Promise.resolve(),
        reason: { name: "ChunkLoadError", message: "Loading chunk x failed" },
      }),
    );

    await new Promise((r) => setTimeout(r, 30));
    expect(reload).not.toHaveBeenCalled();
    dispose();
  });
});
