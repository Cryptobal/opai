"use client";

import { useCallback, type KeyboardEvent, type PointerEvent } from "react";

export const READER_KEYBOARD_STEP = 24;

type Options = {
  width: number;
  setWidth: (next: number | ((prev: number) => number)) => void;
  clamp: (width: number) => number;
  onReset: () => void;
  step?: number;
};

/**
 * Gesto de redimensionado horizontal del lector (pointer + teclado).
 * El panel anclado a la derecha usa startWidth + startX - clientX.
 */
export function useReaderResize({
  width,
  setWidth,
  clamp,
  onReset,
  step = READER_KEYBOARD_STEP,
}: Options) {
  const onResizePointerDown = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      const startX = event.clientX;
      const startWidth = width;
      const priorCursor = document.body.style.cursor;
      const priorSelect = document.body.style.userSelect;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const move = (moveEvent: globalThis.PointerEvent) => {
        const next = startWidth + startX - moveEvent.clientX;
        setWidth(clamp(next));
      };
      const stop = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", stop);
        window.removeEventListener("pointercancel", stop);
        document.body.style.cursor = priorCursor;
        document.body.style.userSelect = priorSelect;
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", stop, { once: true });
      window.addEventListener("pointercancel", stop, { once: true });
    },
    [width, setWidth, clamp],
  );

  const onResizeKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setWidth((w) => clamp(w + step));
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setWidth((w) => clamp(w - step));
      } else if (event.key === "Home") {
        event.preventDefault();
        onReset();
      }
    },
    [setWidth, clamp, onReset, step],
  );

  return { onResizePointerDown, onResizeKeyDown };
}
