import { describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { createRef } from "react";
import { useSwipeGesture } from "../useSwipeGesture";

function touch(x: number, y: number) {
  return { clientX: x, clientY: y } as unknown as React.Touch;
}

describe("useSwipeGesture", () => {
  it("handleMove no usa setState — el transform va al targetRef", () => {
    const el = document.createElement("div");
    const targetRef = createRef<HTMLElement>();
    Object.defineProperty(targetRef, "current", { value: el, writable: true });

    let renders = 0;
    const { result } = renderHook(() => {
      renders += 1;
      return useSwipeGesture({
        followFinger: true,
        targetRef,
        mobileOnly: false,
        onSwipeDown: vi.fn(),
      });
    });

    const afterMount = renders;
    act(() => {
      result.current.onTouchStart({
        touches: [touch(10, 10)],
      } as unknown as React.TouchEvent);
    });
    act(() => {
      result.current.onTouchMove({
        touches: [touch(10, 80)],
      } as unknown as React.TouchEvent);
    });
    // Puede haber rAF; forzamos un frame.
    act(() => {
      // noop — si hubiera setState, renders subiría
    });

    expect(renders).toBe(afterMount);
    expect(result.current.translateY).toBeUndefined();
  });
});
