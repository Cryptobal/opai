import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  BP,
  TOUCH_LAYOUT_MAX,
  TOUCH_LAYOUT_QUERY,
} from "@/lib/breakpoints";
import { useIsTouchLayout } from "@/hooks/useIsTouchLayout";

describe("breakpoints", () => {
  it("expone los breakpoints Tailwind por defecto", () => {
    expect(BP).toEqual({ sm: 640, md: 768, lg: 1024, xl: 1280 });
  });

  it("TOUCH_LAYOUT_MAX es lg - 1 (alineado con el shell)", () => {
    expect(TOUCH_LAYOUT_MAX).toBe(1023);
    expect(TOUCH_LAYOUT_MAX).toBe(BP.lg - 1);
  });

  it("TOUCH_LAYOUT_QUERY usa max-width del layout táctil", () => {
    expect(TOUCH_LAYOUT_QUERY).toBe("(max-width: 1023px)");
  });
});

describe("useIsTouchLayout", () => {
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  function mockMatchMedia(matches: boolean) {
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
      _listeners: listeners,
    })) as unknown as typeof window.matchMedia;
    return listeners;
  }

  it("devuelve true bajo el breakpoint del shell", () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useIsTouchLayout());
    expect(result.current).toBe(true);
    expect(window.matchMedia).toHaveBeenCalledWith(TOUCH_LAYOUT_QUERY);
  });

  it("reacciona a cambios de viewport", () => {
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

    const { result } = renderHook(() => useIsTouchLayout());
    expect(result.current).toBe(false);

    act(() => {
      matches = true;
      for (const cb of listeners) cb();
    });
    expect(result.current).toBe(true);
  });
});
