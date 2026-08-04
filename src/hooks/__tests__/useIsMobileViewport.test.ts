import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useIsMobileViewport } from "../useIsMobileViewport";

describe("useIsMobileViewport", () => {
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  function mockMatchMedia(matches: boolean) {
    const listeners = new Set<() => void>();
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: (_type: string, cb: () => void) => {
        listeners.add(cb);
      },
      removeEventListener: (_type: string, cb: () => void) => {
        listeners.delete(cb);
      },
      dispatchEvent: vi.fn(),
      /** Test helper */
      _emit: () => {
        for (const cb of listeners) cb();
      },
    })) as unknown as typeof window.matchMedia;
    return () => {
      const mq = window.matchMedia("") as unknown as { _emit: () => void };
      mq._emit();
    };
  }

  beforeEach(() => {
    mockMatchMedia(false);
  });

  it("devuelve el valor correcto en el primer render (sin flip false→true)", () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useIsMobileViewport());
    expect(result.current).toBe(true);
  });

  it("devuelve false en viewport desktop", () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => useIsMobileViewport());
    expect(result.current).toBe(false);
  });

  it("reacciona a cambios de matchMedia", () => {
    let matches = false;
    const listeners = new Set<() => void>();
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      get matches() {
        return matches;
      },
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: (_type: string, cb: () => void) => {
        listeners.add(cb);
      },
      removeEventListener: (_type: string, cb: () => void) => {
        listeners.delete(cb);
      },
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;

    const { result } = renderHook(() => useIsMobileViewport(768));
    expect(result.current).toBe(false);

    act(() => {
      matches = true;
      for (const cb of listeners) cb();
    });
    expect(result.current).toBe(true);
  });
});
