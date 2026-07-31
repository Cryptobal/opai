/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useVisualViewportFrame } from "../useVisualViewportFrame";

describe("useVisualViewportFrame", () => {
  const listeners = new Map<string, Set<() => void>>();

  beforeEach(() => {
    listeners.clear();
    const vv = {
      offsetTop: 0,
      height: 800,
      addEventListener: (type: string, fn: () => void) => {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(fn);
      },
      removeEventListener: (type: string, fn: () => void) => {
        listeners.get(type)?.delete(fn);
      },
    };
    Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
    Object.defineProperty(window, "visualViewport", { value: vv, configurable: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reporta el frame inicial del visualViewport", () => {
    const { result } = renderHook(() => useVisualViewportFrame());
    expect(result.current).toEqual({ top: 0, height: 800, keyboardInset: 0 });
  });

  it("al abrir el teclado actualiza top/height e inset", () => {
    const { result } = renderHook(() => useVisualViewportFrame());
    const vv = window.visualViewport!;
    Object.defineProperty(vv, "offsetTop", { value: 40, configurable: true });
    Object.defineProperty(vv, "height", { value: 400, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });

    act(() => {
      listeners.get("resize")?.forEach((fn) => fn());
    });

    expect(result.current.top).toBe(40);
    expect(result.current.height).toBe(400);
    // 800 - 400 - 40 = 360 → teclado
    expect(result.current.keyboardInset).toBe(360);
  });
});
