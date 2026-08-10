import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useVisibilityAwareInterval } from "../useVisibilityAwareInterval";

describe("useVisibilityAwareInterval", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function setVisibility(state: DocumentVisibilityState) {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => state,
    });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
  }

  it("ejecuta al montar + ticks normales mientras está visible (95s / 30s → 4)", () => {
    const cb = vi.fn();
    renderHook(() => useVisibilityAwareInterval(cb, 30_000));

    expect(cb).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(95_000);
    });

    expect(cb).toHaveBeenCalledTimes(4);
  });

  it("no ejecuta mientras está oculto", () => {
    const cb = vi.fn();
    renderHook(() => useVisibilityAwareInterval(cb, 30_000));
    expect(cb).toHaveBeenCalledTimes(1);

    setVisibility("hidden");
    const countWhileHidden = cb.mock.calls.length;

    act(() => {
      vi.advanceTimersByTime(120_000);
    });

    expect(cb).toHaveBeenCalledTimes(countWhileHidden);
  });

  it("hace un catch-up al volver a visible tras 120s ocultos y luego cadencia normal", () => {
    const cb = vi.fn();
    renderHook(() => useVisibilityAwareInterval(cb, 30_000));
    expect(cb).toHaveBeenCalledTimes(1);

    setVisibility("hidden");
    act(() => {
      vi.advanceTimersByTime(120_000);
    });
    expect(cb).toHaveBeenCalledTimes(1);

    setVisibility("visible");
    expect(cb).toHaveBeenCalledTimes(2);
    expect(cb.mock.calls[1]?.[0]).toEqual({ isCatchUp: true });

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(cb).toHaveBeenCalledTimes(3);
    expect(cb.mock.calls[2]?.[0]).toEqual({ isCatchUp: false });
  });

  it("no hace catch-up si el gap oculto es menor a minCatchUpGapMs", () => {
    const cb = vi.fn();
    renderHook(() =>
      useVisibilityAwareInterval(cb, 30_000, { minCatchUpGapMs: 30_000 }),
    );
    expect(cb).toHaveBeenCalledTimes(1);

    setVisibility("hidden");
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    setVisibility("visible");

    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("limpia timers al desmontar", () => {
    const cb = vi.fn();
    const { unmount } = renderHook(() => useVisibilityAwareInterval(cb, 30_000));
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
