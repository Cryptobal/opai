/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { SUPPRESS_CLICK_MS } from "../row-swipe-gesture";
import { useRowSwipe } from "../useRowSwipe";

describe("useRowSwipe — supresión de click y scroll", () => {
  beforeEach(() => {
    vi.spyOn(performance, "now").mockReturnValue(1000);
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("wasDragged es puro y respeta la ventana temporal", () => {
    const { result } = renderHook(() =>
      useRowSwipe({ enabled: true }),
    );

    // Sin gesto: no suprime.
    expect(result.current.wasDragged()).toBe(false);
    expect(result.current.wasDragged()).toBe(false);

    // Simular fin de arrastre con movimiento real.
    act(() => {
      result.current.dragProps.onDragStart?.(
        {} as never,
        { offset: { x: 0, y: 0 }, velocity: { x: 0, y: 0 }, point: { x: 0, y: 0 }, delta: { x: 0, y: 0 } } as never,
      );
    });
    act(() => {
      (performance.now as ReturnType<typeof vi.fn>).mockReturnValue(1100);
      result.current.dragProps.onDragEnd?.(
        {} as never,
        {
          offset: { x: 40, y: 0 },
          velocity: { x: 0, y: 0 },
          point: { x: 40, y: 0 },
          delta: { x: 40, y: 0 },
        } as never,
      );
    });

    (performance.now as ReturnType<typeof vi.fn>).mockReturnValue(1100 + 100);
    expect(result.current.wasDragged()).toBe(true);
    // Puro: segunda lectura dentro de la ventana sigue true.
    expect(result.current.wasDragged()).toBe(true);

    (performance.now as ReturnType<typeof vi.fn>).mockReturnValue(
      1100 + SUPPRESS_CLICK_MS + 1,
    );
    expect(result.current.wasDragged()).toBe(false);
  });

  it("scroll con panel abierto llama a close", () => {
    const { result } = renderHook(() =>
      useRowSwipe({ enabled: true }),
    );

    // Abrir panel vía snap.
    act(() => {
      result.current.dragProps.onDragStart?.(
        {} as never,
        { offset: { x: 0, y: 0 }, velocity: { x: 0, y: 0 }, point: { x: 0, y: 0 }, delta: { x: 0, y: 0 } } as never,
      );
    });
    act(() => {
      result.current.dragProps.onDragEnd?.(
        {} as never,
        {
          offset: { x: 90, y: 0 },
          velocity: { x: 0, y: 0 },
          point: { x: 90, y: 0 },
          delta: { x: 90, y: 0 },
        } as never,
      );
    });
    expect(result.current.openSide).toBe("right");

    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });
    expect(result.current.openSide).toBeNull();
  });
});
